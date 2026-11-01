import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Pango from 'gi://Pango';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Urgency} from 'resource:///org/gnome/shell/ui/messageTray.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ClipboardController} from './clipboard.js';
import {Diagnostics} from './diagnostics.js';
import {notchGeometry, notchDropGeometry, nearDropTarget, containsPoint} from './geometry.js';
import {contentLayout} from './layout.js';
import {MediaController} from './media.js';
import {NotificationBridge} from './notifications.js';
import {QuickActions} from './actions.js';
import {ShelfController} from './shelf.js';
import {SpringGeometry, SPRING_PROFILES, easeOutCubic, interpolateGeometry} from './spring.js';
import {NotchSurface} from './surface.js';
import {box, button, icon, sourceIcon, emptyState, label, wrapLabel, pageBox, setText, slider, setSensitive} from './widgets.js';
import {setIconDirectory, setNotchIcon} from './icons.js';
import {PAGE_CAPACITY, pageSlice, pageLabel} from './pagination.js';
import {formatBytes, formatTime, plainText, previewText, countNotifications, helperErrorMessage,
    mediaDisplayTitle, mediaDisplayArtist, visualizerLevels} from './model.js';

const TABS = [
    ['home', 'Home', 'user-home-symbolic'],
    ['media', 'Music', 'audio-x-generic-symbolic'],
    ['notifications', 'Alerts', 'preferences-system-notifications-symbolic'],
    ['system', 'System', 'utilities-system-monitor-symbolic'],
    ['shelf', 'Shelf', 'folder-symbolic'],
    ['clipboard', 'Clips', 'edit-paste-symbolic'],
];

export class NotchView {
    constructor(extension) {
        this.extension = extension;
        this.settings = extension.settings;
        this.directory = extension.dir;
        setIconDirectory(this.directory.get_child('icons'));
        this.interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this.dead = false;
        this.mode = 'closed';
        this.tab = 'home';
        this.hovered = false;
        this.externalDrag = false;
        this.locked = false;
        this.allowed = true;
        this.timers = new Map();
        this.springs = null;
        this.timeline = null;
        this.visualTimer = 0;
        this.visualStep = 0;
        this._relayoutDepth = 0;
        this._relayoutPending = null;
        this._relayoutTimes = [];
        this._safeUntil = 0;
        this._animationToken = 0;
        this._animationWatchdog = 0;
        this._appliedGeometryKey = '';
        this._adaptSignature = '';
        this.peekNotification = null;
        this._expandedNotifications = new WeakSet();
        this.clockHidden = false;
        this.options = this.readOptions();
        this.media = new MediaController(this.directory, () => this.updateMedia(), e => this.showError(e));
        this.diagnostics = new Diagnostics(this.directory, () => this.updateSystem());
        this.actions = new QuickActions(this.settings, () => this.updateActions());
        this.shelfPage = 0;
        this.clipboardPage = 0;
        this.clipboard = new ClipboardController(this.settings.get_int('clipboard-limit'), () => this.updateClipboard());
        this.shelf = new ShelfController(this.directory, () => this.updateShelf(), e => this.showError(e), count => this.dropCompleted(count));
        this.clock = new GnomeDesktop.WallClock();
        this.clock.connectObject('notify::clock', () => this.updateClock(), this);
        this.build();
        this.clipboard.configure(this.settings.get_boolean('clipboard-enabled'), this.settings.get_int('clipboard-limit'));
        this.connectEnvironment();
        this.injections = new InjectionManager();
        this.notifications = new NotificationBridge({
            tray: Main.messageTray, injections: this.injections, criticalUrgency: Urgency.CRITICAL,
            canHandle: () => this.allowed && !this.externalDrag,
            onActive: (notification, countOnly) => this.notificationActive(notification, countOnly),
            onFallback: () => this.endPeek(),
        });
        this.notifications.configure(this.settings.get_boolean('notifications-in-notch'), this.allowed);
        this.settings.connectObject('changed', (_settings, key) => this.settingChanged(key), this);
        this.media.start();
        this.diagnostics.start();
        this.shelf.start().then(ok => { if (ok && !this.dead) this.shelf.prepareDropTarget(); });
        this.updateMedia();
        this.updateShelf();
        this.updateClipboard();
        this.updateClock();
        this.selectTab('home', false);
        this.relayout('resize', true);
        this.syncVisibility();
    }

    get expanded() {
        return this.mode === 'open';
    }

    readOptions() {
        const theme = St.ThemeContext.get_for_stage(global.stage);
        const cssScale = Math.max(1, theme.scale_factor || 1);
        const textScale = Math.max(0.8, Math.min(2, this.interfaceSettings.get_double('text-scaling-factor') || 1));
        const notchScale = Math.max(0.75, Math.min(1.5, this.settings.get_double('notch-scale')));
        const layoutScale = notchScale * textScale;
        return {
            cssScale, layoutScale, contentScale: notchScale, textScale,
            placement: this.settings.get_string('placement'),
            collapsedWidth: this.settings.get_int('collapsed-width'),
            collapsedHeight: this.settings.get_int('collapsed-height'),
            expandedWidth: this.settings.get_int('expanded-width'),
            expandedHeight: this.settings.get_int('expanded-height'),
            cornerRadius: this.settings.get_int('corner-radius'),
            adaptiveCorners: this.settings.get_boolean('adaptive-corners'),
            matchPanelHeight: this.settings.get_boolean('match-panel-height'),
            floatingMargin: this.settings.get_int('floating-margin'),
            horizontalOffset: this.settings.get_int('horizontal-offset'),
            panelHeight: Main.layoutManager.panelBox.height || Math.round(32 * cssScale),
            opacity: this.settings.get_double('opacity'),
            tab: this.tab,
            mediaWings: this.settings.get_boolean('closed-media') && this.hasMediaWings(),
            hovered: this.hovered && this.mode === 'closed',
            statusExtra: this.statusBar?.visible ? 72 : 0,
        };
    }

    hasMediaWings() {
        const state = this.media?.snapshot();
        return !!state?.names.length && state.status !== 'Stopped';
    }

    monitor() {
        const index = this.settings.get_int('monitor-index');
        return Main.layoutManager.monitors[index] ?? Main.layoutManager.primaryMonitor ??
            Main.layoutManager.monitors[0] ?? {x: 0, y: 0, width: 1920, height: 1080};
    }

    geometry(expanded = this.expanded, mode = null) {
        return notchGeometry(this.monitor(), this.options, expanded, mode ?? (expanded ? 'open' : 'closed'));
    }

    build() {
        this.actor = new St.Widget({style_class: 'notch-shell', reactive: true,
            track_hover: true, clip_to_allocation: true, layout_manager: new Clutter.FixedLayout(),
            accessible_name: 'Notch'});
        Main.layoutManager.addChrome(this.actor, {trackFullscreen: true});
        this.surface = new NotchSurface();
        this.actor.add_child(this.surface);

        this.closedLayer = new St.Widget({layout_manager: new Clutter.BinLayout(), style_class: 'notch-closed'});
        this.pill = new St.Button({style_class: 'notch-closed-button', can_focus: true,
            accessible_name: 'Open notch', x_expand: true, y_expand: true});
        const closedRow = box(false, 'notch-closed-row', 8);
        const leftWing = box(false, '', 0);
        leftWing.set_size(32, -1);
        const rightWing = box(false, '', 0);
        rightWing.set_size(32, -1);
        this.liveMusicIcon = icon('audio-x-generic-symbolic', 18);
        this.liveMusicIcon.add_style_class_name('notch-live-music');
        this.liveBars = box(false, 'notch-live-bars', 2);
        this.liveBars.y_align = Clutter.ActorAlign.CENTER;
        this.barWidgets = [0.42, 0.88, 0.58].map(level => {
            const bar = new St.Widget({style_class: 'notch-live-bar', y_align: Clutter.ActorAlign.END});
            // Grow from the bottom edge; Clutter scale animates without relayout.
            bar.set_pivot_point(0.5, 1);
            bar.set_scale(1, level);
            this.liveBars.add_child(bar);
            return bar;
        });
        const clockBox = box(false, 'notch-clock-box', 5);
        clockBox.x_expand = true;
        clockBox.x_align = Clutter.ActorAlign.CENTER;
        this.summaryClock = label('', 'notch-summary-clock');
        this.unreadDot = new St.Widget({style_class: 'notch-unread-dot', visible: false});
        clockBox.add_child(this.summaryClock);
        clockBox.add_child(this.unreadDot);
        leftWing.add_child(this.liveMusicIcon);
        rightWing.add_child(this.liveBars);
        closedRow.add_child(leftWing);
        closedRow.add_child(clockBox);
        closedRow.add_child(rightWing);
        this.pill.set_child(closedRow);
        this.pill.connect('clicked', () => {
            if (this.mode === 'peek') this.openNotifications();
            else this.toggle();
        });
        this.closedLayer.add_child(this.pill);
        this.actor.add_child(this.closedLayer);

        this.peek = box(true, 'notch-peek', 6);
        this.peek.visible = false;
        this.actor.add_child(this.peek);

        this.content = box(true, 'notch-content', 0);
        this.content.visible = false;
        this.content.opacity = 0;
        this.header = box(false, 'notch-header', 6);
        this.header.x_align = Clutter.ActorAlign.FILL;
        // Equal, fixed side gutters keep the icon rail perfectly centered no
        // matter which page is active. Labels never change the rail width.
        this.headerSpacer = new St.Widget({style_class: 'notch-header-spacer'});
        this.headerSpacer.set_size(76, -1);
        this.tabsBox = box(false, 'notch-tabs', 4);
        this.tabsBox.x_expand = true;
        this.tabsBox.x_align = Clutter.ActorAlign.CENTER;
        this.tabButtons = new Map();
        for (const [id, title, iconName] of TABS) {
            const tab = button({text: title, iconName, style: 'notch-tab', accessibleName: title,
                onClick: () => this.selectTab(id)});
            tab.set_size(40, 32);
            if (tab._notchLabel) {
                tab._notchLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                tab._notchLabel.x_expand = false;
                tab._notchLabel.visible = false;
            }
            this.tabsBox.add_child(tab);
            this.tabButtons.set(id, tab);
        }
        this.header.add_child(this.headerSpacer);
        this.header.add_child(this.tabsBox);
        this.headerControls = box(false, 'notch-header-controls', 6);
        this.headerControls.set_size(76, -1);
        this.headerControls.x_align = Clutter.ActorAlign.END;
        this.headerControls.add_child(button({iconName: 'emblem-system-symbolic', style: 'notch-icon-button notch-header-button',
            accessibleName: 'Notch settings', onClick: () => this.extension.openPreferences()}));
        this.headerControls.add_child(button({iconName: 'window-close-symbolic', style: 'notch-icon-button notch-header-button',
            accessibleName: 'Close notch', onClick: () => this.setExpanded(false)}));
        this.header.add_child(this.headerControls);
        this.content.add_child(this.header);
        this.pageStack = new St.Widget({layout_manager: new Clutter.BinLayout(), y_expand: true});
        this.pages = {
            home: this.buildHome(),
            media: this.buildMedia(),
            notifications: this.buildNotifications(),
            system: this.buildSystem(),
            shelf: this.buildShelf(),
            clipboard: this.buildClipboard(),
        };
        this.pageContainers = {};
        for (const [id, page] of Object.entries(this.pages)) {
            page.x_expand = true;
            if (id === 'notifications') {
                // Alerts is the only page allowed to scroll. Its inner list owns
                // the ScrollView; the page header stays fixed and centered.
                page.y_expand = true;
                page.y_align = Clutter.ActorAlign.FILL;
            } else {
                page.y_expand = false;
                page.y_align = Clutter.ActorAlign.CENTER;
            }
            this.pageContainers[id] = page;
            this.pageStack.add_child(page);
        }
        this.content.add_child(this.pageStack);
        this.statusBar = box(false, 'notch-status-bar', 6);
        this.statusBar.x_align = Clutter.ActorAlign.CENTER;
        this.statusBar.visible = false;
        this.statusLabel = wrapLabel('', 'notch-status', true);
        this.statusActionButton = button({text: 'Retry', style: 'notch-small-button',
            onClick: () => this.statusAction?.()});
        this.statusActionButton.visible = false;
        this.statusBar.add_child(this.statusLabel);
        this.statusBar.add_child(this.statusActionButton);
        this.statusBar.add_child(button({iconName: 'window-close-symbolic', style: 'notch-icon-button',
            accessibleName: 'Dismiss status message', onClick: () => this.clearStatus()}));
        this.content.add_child(this.statusBar);
        this.actor.add_child(this.content);

        this.actor.connectObject('enter-event', () => {
            this.hovered = true;
            this.clearTimer('closeTimer');
            this.clearTimer('peekTimer');
            if (this.mode === 'closed' && this.settings.get_boolean('open-on-hover') && !this.externalDrag) {
                this.setTimer('hoverTimer', this.settings.get_int('hover-delay-ms'), () => {
                    if (this.hovered && this.mode === 'closed') this.setExpanded(true);
                });
            }
            this.relayout('resize');
            return Clutter.EVENT_PROPAGATE;
        }, 'leave-event', () => {
            this.hovered = false;
            this.clearTimer('hoverTimer');
            this.scheduleClose();
            this.schedulePeek();
            this.relayout('resize');
            return Clutter.EVENT_PROPAGATE;
        }, 'key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape && this.mode !== 'closed') {
                this.setExpanded(false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }, this);
    }



    buildHome() {
        // MacBook-notch apps keep the default open state calm: just the clock.
        const page = pageBox('notch-home-page', 6);
        this.homeIdle = box(true, 'notch-home-idle', 6);
        this.homeIdle.x_expand = true;
        this.homeIdle.x_align = Clutter.ActorAlign.CENTER;
        this.homeIdle.y_align = Clutter.ActorAlign.CENTER;
        this.homeClock = label('', 'notch-home-clock');
        this.homeDate = label('', 'notch-home-date');
        this.homeIdle.add_child(this.homeClock);
        this.homeIdle.add_child(this.homeDate);
        page.add_child(this.homeIdle);
        return page;
    }


    buildNotifications() {
        const page = pageBox('notch-alerts-page', 8);
        const header = box(false, 'notch-page-header', 8);
        header.x_align = Clutter.ActorAlign.CENTER;
        header.add_child(label('Alerts', 'notch-title'));
        this.notificationCount = label('0', 'notch-count-badge');
        header.add_child(this.notificationCount);
        this.notificationClear = button({iconName: 'edit-clear-all-symbolic',
            style: 'notch-icon-button', accessibleName: 'Clear all notifications',
            onClick: () => this.clearNotifications()});
        header.add_child(this.notificationClear);
        page.add_child(header);
        this.notificationScroll = new St.ScrollView({style_class: 'notch-alerts-scroll', x_expand: true, y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true});
        this.notificationList = box(true, 'notch-list', 8);
        this.notificationList.x_expand = true;
        this.notificationList.y_expand = false;
        this.notificationScroll.add_child(this.notificationList);
        page.add_child(this.notificationScroll);
        return page;
    }

    clearNotifications() {
        for (const source of Main.messageTray.getSources()) {
            for (const notification of [...source.notifications]) notification.destroy();
        }
        this.notifications.release();
    }

    notificationActive(notification, countOnly = false) {
        if (this.dead) return;
        this.updateNotificationCount();
        if (countOnly) {
            if (this.tab === 'notifications') this.updateNotifications();
            return;
        }
        if (!notification) {
            this.endPeek();
            if (this.tab === 'notifications') this.updateNotifications();
            return;
        }
        if (this.mode !== 'open' && this.settings.get_boolean('auto-open-notifications') && !this.externalDrag)
            this.showPeek(notification);
        if (this.tab === 'notifications') this.updateNotifications();
    }

    showPeek(notification) {
        this.peekNotification = notification;
        this.mode = 'peek';
        this.peek.destroy_all_children();
        const row = box(false, '', 10);
        const gicon = notification.gicon ?? notification.source?.icon ?? null;
        const image = sourceIcon(gicon, 'preferences-system-notifications-symbolic', 32);
        image.style_class = 'notch-peek-icon';
        image.y_align = Clutter.ActorAlign.START;
        const text = box(true, '', 2);
        text.x_expand = true;
        const title = label(plainText(notification.title || notification.source?.title || 'Notification'),
            'notch-peek-title', true);
        const body = wrapLabel(plainText(notification.body || ''), 'notch-peek-body', true);
        text.add_child(title);
        text.add_child(body);
        row.add_child(image);
        row.add_child(text);
        row.add_child(button({iconName: 'window-close-symbolic', style: 'notch-icon-button',
            accessibleName: 'Dismiss notification peek', onClick: () => this.notifications.release()}));
        this.peek.add_child(row);
        const actions = box(false, '', 6);
        const nativeActions = (notification.actions ?? []).slice(0, 2);
        for (const action of nativeActions) {
            actions.add_child(button({text: plainText(action.label), style: 'notch-peek-action',
                onClick: () => {
                    action.activate();
                    this.notifications.release(notification);
                }}));
        }
        actions.add_child(button({text: 'Open', style: 'notch-peek-action', onClick: () => {
            notification.activate();
            this.openNotifications();
        }}));
        this.peek.add_child(actions);
        this.peek.visible = true;
        this.peek.remove_all_transitions();
        this.peek.opacity = 0;
        this.peek.set_translation(0, -6, 0);
        this.peek.ease({opacity: 255, translation_y: 0, duration: this.motionDuration(160), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        this.closedLayer.remove_all_transitions();
        this.closedLayer.ease({opacity: 0, duration: this.motionDuration(100), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.content.visible = false;
        this.relayout('open');
        this.schedulePeek();
        this.updateSummary();
    }

    openNotifications() {
        this.selectTab('notifications');
        this.setExpanded(true);
    }

    endPeek() {
        if (this.mode !== 'peek') return;
        this.clearTimer('peekTimer');
        this.peekNotification = null;
        this.peek.remove_all_transitions();
        this.peek.ease({opacity: 0, translation_y: -4, duration: this.motionDuration(100), mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => { if (!this.dead && this.mode !== 'peek') this.peek.visible = false; }});
        this.mode = 'closed';
        this.closedLayer.remove_all_transitions();
        this.closedLayer.ease({opacity: 255, duration: this.motionDuration(140), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.relayout('close');
        this.updateSummary();
    }

    schedulePeek() {
        this.clearTimer('peekTimer');
        if (this.mode !== 'peek') return;
        this.setTimer('peekTimer', this.settings.get_int('peek-duration-ms'), () => {
            if (this.hovered || this.pressing) {
                this.schedulePeek();
                return;
            }
            this.notifications.release();
        });
    }

    updateNotificationCount() {
        const count = countNotifications(Main.messageTray.getSources());
        setText(this.notificationCount, String(count));
        this.notificationCount.visible = count > 0;
        this.unreadDot.visible = count > 0 && this.settings.get_boolean('idle-clock');
        setSensitive(this.notificationClear, count > 0);
        const tab = this.tabButtons.get('notifications');
        if (tab) tab.accessible_name = count ? `Alerts, ${count} notifications` : 'Alerts';
    }

    updateNotifications() {
        if (this.dead || !this.notificationList) return;
        this.updateNotificationCount();
        this.notificationList.destroy_all_children();
        const sources = Main.messageTray.getSources();
        const total = countNotifications(sources);
        let rendered = 0;
        outer: for (const source of sources) {
            for (const notification of source.notifications) {
                if (rendered >= 50) break outer;
                rendered++;
                const card = box(true, 'notch-notification', 6);
                const top = box(false, 'notch-notification-top', 8);
                top.x_expand = true;
                const gicon = notification.gicon ?? source.icon ?? null;
                top.add_child(sourceIcon(gicon, 'preferences-system-notifications-symbolic', 20));
                const title = plainText(notification.title || source.title || 'Notification');
                const titleLabel = wrapLabel(title, 'notch-notification-title', true);
                titleLabel.accessible_name = title;
                top.add_child(titleLabel);
                top.add_child(button({iconName: 'window-close-symbolic', style: 'notch-icon-button',
                    accessibleName: 'Dismiss notification', onClick: () => notification.destroy()}));
                card.add_child(top);
                const body = plainText(notification.body || '');
                if (body) {
                    const expanded = this._expandedNotifications.has(notification);
                    const preview = previewText(body, 140);
                    const bodyLabel = wrapLabel(expanded ? body : preview.text, 'notch-notification-body');
                    bodyLabel.accessible_name = body;
                    card.add_child(bodyLabel);
                    if (preview.truncated) {
                        const more = button({text: expanded ? 'Show less' : 'Show more',
                            style: 'notch-small-button notch-notification-more',
                            onClick: () => {
                                if (expanded) this._expandedNotifications.delete(notification);
                                else this._expandedNotifications.add(notification);
                                this.updateNotifications();
                            }});
                        more.x_align = Clutter.ActorAlign.CENTER;
                        card.add_child(more);
                    }
                }
                const nativeActions = (notification.actions ?? []).slice(0, 2);
                if (nativeActions.length) {
                    const actions = box(false, 'notch-notification-actions', 6);
                    actions.x_align = Clutter.ActorAlign.CENTER;
                    for (const action of nativeActions) {
                        actions.add_child(button({text: plainText(action.label), style: 'notch-small-button',
                            onClick: () => action.activate()}));
                    }
                    card.add_child(actions);
                }
                this.notificationList.add_child(card);
            }
        }
        if (!total) this.notificationList.add_child(emptyState('preferences-system-notifications-symbolic',
            'No notifications', 'New alerts will appear here.'));
    }

    updateClock() {
        if (this.dead) return;
        const now = new Date();
        const time = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        setText(this.summaryClock, this.settings.get_boolean('idle-clock') ? time : '');
        setText(this.homeClock, time);
        setText(this.homeDate, now.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'}));
        this.updateSummary();
    }


    updateHome() {
        if (this.homeIdle) this.homeIdle.visible = true;
    }


    updateSummary() {
        if (this.dead || !this.liveMusicIcon) return;
        const state = this.media.snapshot();
        const show = this.settings.get_boolean('closed-media') && state.names.length > 0 && state.status !== 'Stopped';
        this.liveMusicIcon.visible = show;
        this.liveBars.visible = show && state.status === 'Playing';
        this.summaryClock.visible = this.settings.get_boolean('idle-clock');
        this.unreadDot.visible = countNotifications(Main.messageTray.getSources()) > 0 && this.settings.get_boolean('idle-clock');
        this.syncVisualizer();
        const previous = this.options.mediaWings;
        this.options.mediaWings = this.settings.get_boolean('closed-media') && show;
        if (previous !== this.options.mediaWings) this.relayout('resize');
    }

    visualizerActive() {
        return this.allowed && this.mode === 'closed' && this.liveBars?.visible &&
            this.settings.get_boolean('animations') && !!St.Settings.get().enable_animations;
    }

    stopVisualizer() {
        if (this.visualTimer) GLib.source_remove(this.visualTimer);
        this.visualTimer = 0;
        for (const bar of this.barWidgets ?? []) {
            bar.remove_all_transitions();
            bar.set_scale(1, 0.62);
        }
    }

    syncVisualizer() {
        const active = this.visualizerActive();
        if (active && !this.visualTimer) {
            this.visualStep = 0;
            const tick = () => {
                if (this.dead) return GLib.SOURCE_REMOVE;
                if (!this.visualizerActive()) {
                    this.stopVisualizer();
                    return GLib.SOURCE_REMOVE;
                }
                try {
                    const levels = visualizerLevels(this.visualStep++);
                    this.barWidgets.forEach((bar, index) => {
                        bar.remove_all_transitions();
                        bar.ease({scale_y: levels[index], duration: 190,
                            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD});
                    });
                } catch (e) {
                    console.warn(`Notch: equalizer stopped after animation error: ${e.message ?? e}`);
                    this.stopVisualizer();
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            };
            tick();
            this.visualTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 210, tick);
        } else if (!active && this.visualTimer) {
            this.stopVisualizer();
        }
    }

    selectTab(id, animate = true) {
        if (!this.pages[id]) return;
        const previous = this.tab;
        const changed = previous !== id;
        this.tab = id;
        this.options.tab = id;
        const duration = animate && changed && this.expanded ? this.motionDuration(160) : 0;
        for (const [pageId, page] of Object.entries(this.pageContainers)) {
            page.remove_all_transitions();
            if (pageId === id) {
                page.visible = true;
                page.reactive = true;
                if (duration) {
                    page.opacity = 0;
                    page.set_translation(0, 8, 0);
                    page.ease({opacity: 255, translation_y: 0, duration,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
                } else {
                    page.opacity = 255;
                    page.set_translation(0, 0, 0);
                }
            } else if (duration && pageId === previous) {
                page.reactive = false;
                page.ease({opacity: 0, translation_y: -6, duration: Math.round(duration * 0.7),
                    mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onStopped: () => { if (!this.dead && this.tab !== pageId) page.visible = false; }});
            } else {
                page.visible = false;
                page.reactive = false;
            }
        }
        for (const [tabId, tab] of this.tabButtons) {
            const active = tabId === id;
            if (active) tab.add_style_class_name('notch-tab-active');
            else tab.remove_style_class_name('notch-tab-active');
            if (tab._notchIcon) tab._notchIcon.opacity = active ? 255 : 150;
        }
        this.diagnostics.setActive(id === 'system' && this.expanded && this.allowed);
        this.media.setPositionActive(id === 'media' && this.expanded && this.allowed);
        if (id === 'notifications') this.updateNotifications();
        if (id === 'system') this.updateSystem();
        if (id === 'shelf') this.updateShelf();
        if (id === 'clipboard') this.updateClipboard();
        if (animate && this.expanded) this.relayout('resize');
    }

    setExpanded(expanded) {
        if (this.dead) return;
        this.clearTimer('hoverTimer');
        this.clearTimer('closeTimer');
        if (expanded) {
            this.clearTimer('peekTimer');
            this.peek.visible = false;
            this.peekNotification = null;
            this.mode = 'open';
            this.content.visible = true;
            this.content.remove_all_transitions();
            this.content.set_translation(0, -6, 0);
            this.content.ease({opacity: 255, translation_y: 0, duration: this.motionDuration(180), delay: this.motionDuration(70),
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            this.closedLayer.remove_all_transitions();
            this.closedLayer.ease({opacity: 0, duration: this.motionDuration(100), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            this.selectTab(this.tab, false);
            this.relayout('open');
            this.syncVisualizer();
        } else {
            this.mode = 'closed';
            this.peek.visible = false;
            this.peekNotification = null;
            this.notifications?.release();
            this.content.remove_all_transitions();
            this.content.ease({opacity: 0, translation_y: -4, duration: this.motionDuration(90), mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => { if (!this.dead && this.mode === 'closed') this.content.visible = false; }});
            this.closedLayer.remove_all_transitions();
            this.closedLayer.ease({opacity: 255, duration: this.motionDuration(140), delay: this.motionDuration(60),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            this.diagnostics.setActive(false);
            this.media.setPositionActive(false);
            this.relayout('close');
        }
        this.updateSummary();
    }

    toggle() {
        this.setExpanded(!this.expanded);
    }

    motionDuration(ms) {
        return this.settings.get_boolean('animations') && !!St.Settings.get().enable_animations ? ms : 0;
    }

    scheduleClose() {
        this.clearTimer('closeTimer');
        if (!this.expanded || this.hovered || this.externalDrag) return;
        const delay = this.settings.get_int('auto-hide-ms');
        if (delay > 0) this.setTimer('closeTimer', delay, () => this.setExpanded(false));
        else if (this.settings.get_boolean('open-on-hover'))
            this.setTimer('closeTimer', 120, () => { if (!this.hovered) this.setExpanded(false); });
    }

    setTimer(name, delay, callback) {
        this.clearTimer(name);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(0, delay), () => {
            this.timers.delete(name);
            if (!this.dead) callback();
            return GLib.SOURCE_REMOVE;
        });
        this.timers.set(name, id);
    }

    clearTimer(name) {
        const id = this.timers.get(name);
        if (id) GLib.source_remove(id);
        this.timers.delete(name);
    }

    layoutPages() {
        if (!this.content) return;
        const openRect = this.geometry(true, 'open');
        const statusText = this.statusBar?.visible ? this.statusLabel.text : '';
        const layout = contentLayout(openRect, this.options, statusText);
        this._layout = layout;
        const css = layout.cssScale;
        this.content.set_size(layout.width * css, layout.height * css);
        this.header.set_size(layout.width * css, layout.headerHeight * css);
        this.pageStack.set_size(layout.width * css, layout.pageHeight * css);
        this.statusBar.set_size(layout.width * css, layout.footerHeight * css);
        this.adaptPages(layout);
    }


    adaptPages(layout) {
        for (const [id, tab] of this.tabButtons) {
            const showLabel = layout.header === 'labels';
            if (tab._notchLabel) tab._notchLabel.visible = showLabel;
            tab.set_size(showLabel ? 96 : 40, 32);
            if (layout.header === 'icons') tab.add_style_class_name('notch-tab-icon');
            else tab.remove_style_class_name('notch-tab-icon');
            if (tab._notchIcon) tab._notchIcon.opacity = id === this.tab ? 255 : 150;
        }
        if (this.statsGrid) this.layoutSystemCards(layout.columns);
        if (this.actionsRow) {
            this.actionsRow.vertical = layout.compact;
            this.actionsRow.x_align = Clutter.ActorAlign.CENTER;
            for (const {widget} of this.actionButtons ?? []) widget.x_expand = layout.compact;
        }
        const compactButton = (widget, compact) => {
            if (widget?._notchLabel) widget._notchLabel.visible = !compact;
        };
        compactButton(this.notificationClear, layout.compact);
        compactButton(this.shelfAdd, layout.compact);
        compactButton(this.shelfClear, layout.compact);
        compactButton(this.clipboardCapture, layout.compact);
        compactButton(this.clipboardClear, layout.compact);
        const signature = `${layout.header}|${layout.compact}|${layout.narrow}|${layout.columns}|${this.tab}|${this.mode}`;
        if (signature !== this._adaptSignature) {
            this._adaptSignature = signature;
            if (this.mode === 'open') {
                if (this.tab === 'notifications') this.updateNotifications();
                if (this.tab === 'shelf') this.updateShelf();
                if (this.tab === 'clipboard') this.updateClipboard();
            }
        }
    }

    layoutSystemCards(columns) {
        if (!this.statsGrid || this._statColumns === columns) return;
        this._statColumns = columns;
        for (const card of Object.values(this.statCards)) card.get_parent()?.remove_child(card);
        this.statsGrid.destroy_all_children();
        const ids = ['cpu', 'ram', 'battery', 'network'];
        for (let i = 0; i < ids.length; i += columns) {
            const row = box(false, 'notch-stat-row', 8);
            row.x_align = Clutter.ActorAlign.CENTER;
            for (const id of ids.slice(i, i + columns)) {
                const card = this.statCards[id];
                card.x_expand = true;
                row.add_child(card);
            }
            this.statsGrid.add_child(row);
        }
    }

    relayout(kind = 'resize', immediate = false) {
        if (this.dead || !this.actor) return;
        // Never allow recursive layout passes to spin the Shell main loop.
        if (this._relayoutDepth > 0) {
            this._relayoutPending = {kind, immediate: immediate || !!this._relayoutPending?.immediate};
            return;
        }
        const now = GLib.get_monotonic_time();
        this._relayoutTimes = this._relayoutTimes.filter(time => now - time < 1_000_000);
        this._relayoutTimes.push(now);
        if (this._relayoutTimes.length > 40) {
            // A hover/geometry feedback storm must degrade to snapping, not freeze GNOME.
            this._safeUntil = now + 5_000_000;
            this._relayoutTimes.length = 0;
            console.warn('Notch: relayout storm detected; snapping geometry for 5 seconds');
        }
        this._relayoutDepth++;
        try {
            this.options = {...this.options, ...this.readOptions(), tab: this.tab,
                mediaWings: this.settings.get_boolean('closed-media') && this.hasMediaWings(),
                hovered: this.hovered && this.mode === 'closed'};
            const rect = this.geometry(this.expanded, this.mode);
            this.layoutPages();
            this.animateTo(rect, kind, immediate);
            if (this.reserve) this.updateReserve();
            if (this.shelf.dropVisible) {
                this.shelf.updateDropTarget(this.dropRectangle());
                this.placeHelper();
            }
        } finally {
            this._relayoutDepth--;
            if (this._relayoutPending) {
                const pending = this._relayoutPending;
                this._relayoutPending = null;
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (!this.dead) this.relayout(pending.kind, pending.immediate);
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    animateTo(rect, kind, immediate) {
        const key = JSON.stringify(rect);
        if (this._targetKey === key && this.springs && !immediate) return;
        this._targetKey = key;
        this.stopTimeline();
        if (!this.springs) this.springs = new SpringGeometry(rect);
        const inSafeMode = GLib.get_monotonic_time() < this._safeUntil;
        const animated = this.settings.get_boolean('animations') && !!St.Settings.get().enable_animations &&
            !immediate && !inSafeMode;
        if (!animated) {
            this.springs.snap(rect);
            this.applyGeometry(rect);
            return;
        }
        const smooth = this.settings.get_string('animation-profile') === 'smooth';
        const profile = SPRING_PROFILES[kind] ?? SPRING_PROFILES.resize;
        const from = Object.fromEntries(Object.entries(this.springs.springs).map(([k, s]) => [k, s.value]));
        const duration = Math.max(1, smooth ?
            this.settings.get_int(kind === 'close' ? 'close-animation-ms' : 'open-animation-ms') : 900);
        this.springs.setTarget(rect, profile);
        const token = ++this._animationToken;
        this._animation = {smooth, from, to: rect, duration, last: 0, token};
        const finish = () => {
            if (this.dead || !this._animation || this._animation.token !== token) return;
            this.springs.snap(rect);
            this.applyGeometry(rect);
            this.stopTimeline();
        };
        // Single-shot timeline + hard watchdog. A repeating timeline could keep
        // repainting forever if a spring never reported settled on a stalled frame.
        this.timeline = new Clutter.Timeline({duration, repeat_count: 1, actor: this.actor});
        this.timeline.connectObject('new-frame', (_timeline, elapsed) => {
            if (this.dead || !this._animation || this._animation.token !== token) return;
            const state = this._animation;
            let next;
            if (state.smooth) {
                next = interpolateGeometry(state.from, state.to, easeOutCubic(elapsed / state.duration));
            } else {
                const dt = Math.max(0, (elapsed - state.last) / 1000);
                state.last = elapsed;
                next = this.springs.step(dt);
            }
            this.applyGeometry(next);
            if ((state.smooth && elapsed >= state.duration) || (!state.smooth && this.springs.settled))
                finish();
        }, 'completed', finish, this);
        this._animationWatchdog = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration + 750, () => {
            this._animationWatchdog = 0;
            finish();
            return GLib.SOURCE_REMOVE;
        });
        this.timeline.start();
    }

    stopTimeline() {
        if (this._animationWatchdog) GLib.source_remove(this._animationWatchdog);
        this._animationWatchdog = 0;
        this._animationToken++;
        if (!this.timeline) return;
        this.timeline.stop();
        this.timeline.disconnectObject(this);
        this.timeline = null;
        this._animation = null;
    }

    applyGeometry(rect) {
        const rounded = {
            x: Math.round(rect.x), y: Math.round(rect.y),
            width: Math.round(rect.width), height: Math.round(rect.height),
            topRadius: Math.round(rect.topRadius), bottomRadius: Math.round(rect.bottomRadius),
        };
        const geometryKey = JSON.stringify(rounded);
        if (geometryKey === this._appliedGeometryKey) return;
        this._appliedGeometryKey = geometryKey;
        rect = rounded;
        const layout = this._layout;
        const scale = layout?.scale ?? this.options.cssScale * this.options.layoutScale;
        const css = layout?.cssScale ?? this.options.cssScale;
        const contentScale = layout?.layoutScale ?? this.options.layoutScale;
        this.actor.set_position(Math.round(rect.x), Math.round(rect.y));
        this.actor.set_size(Math.round(rect.width), Math.round(rect.height));
        this.surface.setGeometry(rect.width, rect.height, rect.topRadius, rect.bottomRadius, css);
        this.surface.opacity = Math.round(this.options.opacity * 255);
        const panelHeight = this.options.panelHeight;
        const textScale = layout?.textScale ?? this.options.textScale ?? 1;
        const closedScale = Math.min(contentScale, panelHeight / Math.max(1, 32 * css * textScale));
        this.closedLayer.set_size(rect.width / closedScale, panelHeight / closedScale);
        this.closedLayer.set_scale(closedScale, closedScale);
        this.closedLayer.set_position(0, 0);
        if (layout) {
            const contentWidth = layout.width * scale;
            this.content.set_scale(contentScale, contentScale);
            this.content.set_position(Math.round((rect.width - contentWidth) / 2),
                panelHeight + layout.paddingTop * scale);
        }
        const gutter = layout?.paddingX ?? 16;
        const peekWidth = Math.max(120, rect.width / scale - 2 * gutter);
        const peekHeight = Math.max(48, (rect.height - panelHeight) / scale - 12);
        this.peek.set_scale(contentScale, contentScale);
        this.peek.set_size(peekWidth * css, peekHeight * css);
        this.peek.set_position(gutter * scale, panelHeight + (layout?.paddingTop ?? 4) * scale);
    }

    connectEnvironment() {
        Main.layoutManager.connectObject('monitors-changed', () => this.relayout('resize', true), this);
        Main.overview.connectObject('showing', () => this.syncVisibility(),
            'hiding', () => this.syncVisibility(), this);
        Main.sessionMode.connectObject('updated', () => this.syncVisibility(), this);
        global.display.connectObject('in-fullscreen-changed', () => this.syncVisibility(), this);
        this.stagePress = global.stage.connect('captured-event', (_stage, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS) {
                this.pressing = true;
                if (this.mode !== 'closed') {
                    const [x, y] = event.get_coords();
                    const [ax, ay] = this.actor.get_transformed_position();
                    if (!containsPoint({x: ax, y: ay, width: this.actor.width, height: this.actor.height}, x, y))
                        this.setExpanded(false);
                }
            } else if (event.type() === Clutter.EventType.BUTTON_RELEASE) {
                this.pressing = false;
            } else if (event.type() === Clutter.EventType.KEY_PRESS && this.mode !== 'closed' &&
                event.get_key_symbol() === Clutter.KEY_Escape) {
                this.setExpanded(false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.dnd = global.backend.get_dnd();
        this.dnd.connectObject('dnd-enter', () => { this._dropHandled = false; },
            'dnd-position-change', (_dnd, x, y) => this.dragPosition(x, y),
            'dnd-leave', () => { this._dropHandled = false; this.endDrag(); }, this);
        global.display.connectObject('window-created', (_display, window) => {
            if (this.isHelper(window)) {
                this.helperWindow = window;
                this.watchHelperWindow(window);
            }
        }, this);
        this.helperWindow = global.get_window_actors().map(a => a.meta_window).find(w => this.isHelper(w));
        if (this.helperWindow) this.watchHelperWindow(this.helperWindow);
        this.screenSignal = Gio.DBus.session.signal_subscribe('org.gnome.ScreenSaver',
            'org.gnome.ScreenSaver', 'ActiveChanged', '/org/gnome/ScreenSaver', null,
            Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _iface, _signal, params) => {
                this.locked = params.deepUnpack()[0];
                this.clipboard.setPaused(this.locked || !!Main.sessionMode.isLocked);
                this.syncVisibility();
            });
        this.clipboard.setPaused(!!Main.sessionMode.isLocked);
    }

    isHelper(window) {
        return window?.get_title() === 'Notch file drop target' ||
            window?.get_gtk_application_id?.() === 'io.github.pavit12301611.Notch.Helper';
    }

    dragPosition(x, y) {
        if (this.dead || !this.allowed || this._dropHandled) return;
        const target = this.dropRectangle();
        const scale = this.options.cssScale * this.options.layoutScale;
        if (nearDropTarget(x, y, target, 48 * scale)) {
            if (!this.externalDrag) {
                this._dragReturn = {mode: this.mode, tab: this.tab};
                this.externalDrag = true;
                this.clearTimer('hoverTimer');
                this.clearTimer('closeTimer');
                this.clearTimer('peekTimer');
                if (this.mode !== 'closed') this.setExpanded(false);
                this.selectTab('shelf', false);
            }
            this.shelf.showDropTarget(target).then(ok => {
                if (!this.dead && this.externalDrag && ok) this.placeHelper();
            });
            this.placeHelper();
        } else if (this.externalDrag) {
            this.endDrag();
        }
    }

    dropRectangle() {
        return notchDropGeometry(this.monitor(), this.options);
    }

    watchHelperWindow(window) {
        if (this._helperWatched === window) return;
        this._helperActor?.disconnectObject(this);
        this._helperWatched?.disconnectObject(this);
        this._helperWatched = window;
        this._helperActor = null;
        if (!window) return;
        window.connectObject('unmanaged', () => {
            if (this.helperWindow === window) this.helperWindow = null;
            this._helperActor?.disconnectObject(this);
            this._helperActor = null;
            this._helperWatched = null;
            this.setDropOverlay(false);
        }, this);
        const actor = window.get_compositor_private();
        if (actor) {
            this._helperActor = actor;
            actor.connectObject('notify::mapped', () => {
                if (!this.dead && this.shelf.dropVisible) this.placeHelper(true);
            }, this);
        }
    }

    setDropOverlay(active) {
        this._dropOverlay = !!active;
        if (!this.actor) return;
        this.actor.visible = this.allowed && !this._dropOverlay;
        this.actor.reactive = this.allowed && !this._dropOverlay;
    }

    placeHelper(force = false) {
        const window = this.helperWindow ??
            global.get_window_actors().map(a => a.meta_window).find(w => this.isHelper(w));
        if (!window || !this.shelf.dropVisible) return;
        this.helperWindow = window;
        this.watchHelperWindow(window);
        const rect = this.dropRectangle();
        const actor = window.get_compositor_private();
        const mapped = !!actor?.mapped;
        const key = `${rect.x},${rect.y},${rect.width},${rect.height},${mapped}`;
        if (!force && this.placedHelperKey === key) return;
        this.placedHelperKey = key;
        // Mutter, not the unprivileged GTK client, positions this temporary surface.
        window.make_above();
        window.stick();
        window.move_frame(true, rect.x, rect.y);
        window.raise();
        // Shell chrome paints above application windows. Hide it while the GTK
        // drop surface occupies the notch, otherwise the drop never reaches GTK.
        if (mapped) this.setDropOverlay(true);
    }

    dropCompleted(count) {
        if (this.dead) return;
        this._dropHandled = true;
        this.endDrag({restore: false});
        this.selectTab('shelf', false);
        this.setExpanded(true);
        const n = Math.max(1, Number(count) || 1);
        this.showStatus(`${n} file${n === 1 ? '' : 's'} stashed. Originals stay in place.`, {timeout: 2600});
        this.pulse(this.shelfList);
    }

    pulse(widget) {
        if (!widget || !this.motionDuration(1)) return;
        widget.remove_all_transitions();
        widget.set_pivot_point(0.5, 0.5);
        widget.set_scale(1, 1);
        widget.ease({scale_x: 1.02, scale_y: 1.02, duration: 110, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (this.dead) return;
                widget.ease({scale_x: 1, scale_y: 1, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            }});
    }

    endDrag({restore = true} = {}) {
        const previous = this._dragReturn;
        this._dragReturn = null;
        this.externalDrag = false;
        this.placedHelperKey = null;
        this.setDropOverlay(false);
        this.shelf?.hideDropTarget();
        if (this.helperWindow) {
            this.helperWindow.unmake_above();
            this.helperWindow.unstick();
        }
        if (restore && previous && !this.dead) {
            this.selectTab(previous.tab, false);
            if (previous.mode === 'open') this.setExpanded(true);
        }
    }

    settingChanged(key) {
        this.options = this.readOptions();
        if (key.startsWith('clipboard-')) {
            this.clipboard.configure(this.settings.get_boolean('clipboard-enabled'),
                this.settings.get_int('clipboard-limit'));
        }
        if (key.startsWith('show-')) {
            this.actions.destroy();
            this.actions = new QuickActions(this.settings, () => this.updateActions());
            this._actionSignature = null;
            this.updateActions();
        }
        if (key === 'notifications-in-notch' || key === 'auto-open-notifications')
            this.notifications.configure(this.settings.get_boolean('notifications-in-notch'), this.allowed);
        if (key === 'idle-clock' || key === 'replace-panel-clock' || key === 'placement' || key === 'monitor-index') {
            this.syncPanelClock();
            this.updateSummary();
        }
        if (key === 'closed-media' || key === 'idle-clock') {
            this.updateClock();
            this.updateSummary();
        }
        if (key === 'opacity' && this.surface)
            this.surface.opacity = Math.round(this.settings.get_double('opacity') * 255);
        this.options = this.readOptions();
        this.relayout();
        this.syncVisibility();
        if (key === 'reserve-space' || key === 'placement') this.updateReserve();
    }

    syncPanelClock() {
        const container = Main.panel.statusArea.dateMenu?.container;
        if (!container) return;
        const hide = this.allowed && this.settings.get_boolean('replace-panel-clock') &&
            this.options.placement === 'panel' &&
            this.monitor().index === Main.layoutManager.primaryMonitor?.index;
        if (hide && !this.clockHidden) {
            this.clockOriginal = {opacity: container.opacity, reactive: container.reactive};
            this.clockHidden = true;
        }
        if (this.clockHidden) {
            container.opacity = hide ? 0 : (this.clockOriginal?.opacity ?? 255);
            container.reactive = hide ? false : (this.clockOriginal?.reactive ?? true);
            if (!hide) this.clockHidden = false;
        }
    }

    updateReserve() {
        if (this.reserve) {
            Main.layoutManager.removeChrome(this.reserve);
            this.reserve.destroy();
            this.reserve = null;
        }
        if (!this.settings.get_boolean('reserve-space') || this.options.placement === 'floating') return;
        const rect = notchGeometry(this.monitor(), {...this.options, hovered: false, mediaWings: false}, false, 'closed');
        // Struts are monitor-edge based. This intentionally reserves only collapsed height,
        // never expanded height, so opening the notch does not rearrange windows.
        this.reserve = new St.Widget({reactive: false, opacity: 0, x: rect.x, y: this.monitor().y,
            width: rect.width, height: Math.max(1, rect.y + rect.height - this.monitor().y)});
        Main.layoutManager.addChrome(this.reserve, {affectsStruts: true, trackFullscreen: false});
        this.reserve.visible = this.allowed;
    }

    syncVisibility() {
        const monitor = this.monitor();
        const locked = !!this.locked || !!Main.sessionMode.isLocked || !!Main.sessionMode.isGreeter;
        this.allowed = !locked &&
            !(this.settings.get_boolean('hide-on-fullscreen') &&
              global.display.get_monitor_in_fullscreen(monitor.index)) &&
            !(this.settings.get_boolean('hide-in-overview') && Main.overview.visible);
        this.actor.visible = this.allowed && !this._dropOverlay;
        this.actor.reactive = this.allowed && !this._dropOverlay;
        if (this.reserve) this.reserve.visible = this.allowed;
        this.clipboard.setPaused(locked);
        this.notifications?.configure(this.settings.get_boolean('notifications-in-notch'), this.allowed);
        this.syncPanelClock();
        this.diagnostics.setActive(this.allowed && this.expanded && this.tab === 'system');
        this.media.setPositionActive(this.allowed && this.expanded && this.tab === 'media');
        this.syncVisualizer();
        if (!this.allowed) {
            this.endDrag();
            this.setExpanded(false);
        }
    }



    buildMedia() {
        const page = pageBox('notch-media-page', 10);
        this.mediaEmpty = emptyState('audio-x-generic-symbolic', 'Nothing playing',
            'Start a song in any media player.');
        page.add_child(this.mediaEmpty);

        this.mediaActive = box(true, 'notch-media-active', 10);
        this.mediaActive.x_expand = true;
        this.mediaActive.x_align = Clutter.ActorAlign.CENTER;
        this.mediaTitle = wrapLabel('', 'notch-media-title', true);
        this.mediaArtist = wrapLabel('', 'notch-media-artist', true);
        this.mediaPlayer = button({text: '', iconName: 'view-more-symbolic',
            style: 'notch-small-button notch-media-player', wrapText: true,
            accessibleName: 'Switch media player', onClick: () => this.media.cyclePlayer()});
        this.mediaPlayer.x_align = Clutter.ActorAlign.CENTER;
        this.mediaActive.add_child(this.mediaTitle);
        this.mediaActive.add_child(this.mediaArtist);
        this.mediaActive.add_child(this.mediaPlayer);

        const progress = box(false, 'notch-media-progress', 8);
        progress.x_expand = true;
        progress.x_align = Clutter.ActorAlign.CENTER;
        this.mediaElapsed = label('0:00', 'notch-media-time');
        this.mediaElapsed.set_size(44, -1);
        this.mediaSeek = slider(0, value => this.media.seekTo(value), 'Playback position');
        this.mediaSeek.x_expand = true;
        this.mediaDuration = label('0:00', 'notch-media-time');
        this.mediaDuration.set_size(44, -1);
        progress.add_child(this.mediaElapsed);
        progress.add_child(this.mediaSeek);
        progress.add_child(this.mediaDuration);
        this.mediaActive.add_child(progress);

        const controls = box(false, 'notch-media-controls', 14);
        controls.x_align = Clutter.ActorAlign.CENTER;
        this.mediaPrevious = button({iconName: 'media-skip-backward-symbolic', style: 'notch-icon-button notch-transport',
            accessibleName: 'Previous track', onClick: () => this.media.previous()});
        this.mediaPlay = button({iconName: 'media-playback-start-inverse-symbolic', accessibleName: 'Play or pause',
            style: 'notch-button notch-play notch-play-large', onClick: () => this.media.playPause()});
        this.mediaNext = button({iconName: 'media-skip-forward-symbolic', style: 'notch-icon-button notch-transport',
            accessibleName: 'Next track', onClick: () => this.media.next()});
        controls.add_child(this.mediaPrevious);
        controls.add_child(this.mediaPlay);
        controls.add_child(this.mediaNext);
        this.mediaActive.add_child(controls);
        page.add_child(this.mediaActive);
        return page;
    }



    updateMedia() {
        if (this.dead || !this.mediaTitle) return;
        const state = this.media.snapshot();
        const hasPlayer = state.names.length > 0;
        this.mediaEmpty.visible = !hasPlayer;
        this.mediaActive.visible = hasPlayer;
        this.updateHome();
        this.updateSummary();
        if (!hasPlayer) return;
        const title = mediaDisplayTitle(state);
        setText(this.mediaTitle, title);
        this.mediaTitle.accessible_name = title;
        setText(this.mediaArtist, mediaDisplayArtist(state));
        setText(this.mediaElapsed, formatTime(state.positionUs));
        setText(this.mediaDuration, formatTime(state.lengthUs));
        this.mediaSeek._notchSet(state.lengthUs ? state.positionUs / state.lengthUs : 0);
        this.mediaSeek.reactive = state.canSeek && state.lengthUs > 0;
        this.mediaSeek.can_focus = this.mediaSeek.reactive;
        setSensitive(this.mediaPrevious, state.canGoPrevious);
        setSensitive(this.mediaNext, state.canGoNext);
        setSensitive(this.mediaPlay, state.canControl && (state.canPlay || state.canPause));
        setNotchIcon(this.mediaPlay._notchIcon, state.status === 'Playing' ?
            'media-playback-pause-inverse-symbolic' : 'media-playback-start-inverse-symbolic');
        this.mediaPlay.accessible_name = state.status === 'Playing' ? 'Pause' : 'Play';
        this.mediaPlayer.visible = state.names.length > 1;
        setText(this.mediaPlayer._notchLabel, `${state.identity}  ·  ${state.names.length} players`);
        setSensitive(this.mediaPlayer, state.names.length > 1);
    }




    buildSystem() {
        const page = pageBox('notch-system-page', 12);
        this.statsGrid = box(true, 'notch-stats-grid', 8);
        this.statsGrid.x_expand = true;
        this.stats = {};
        this.statCards = {};
        for (const [id, title, iconName] of [['cpu', 'Processor', 'utilities-system-monitor-symbolic'],
            ['ram', 'Memory', 'drive-harddisk-symbolic'],
            ['battery', 'Battery', 'battery-symbolic'],
            ['network', 'Network', 'network-wired-symbolic']]) {
            const card = box(true, 'notch-card notch-stat-card', 6);
            card.x_expand = true;
            const heading = box(false, 'notch-stat-heading', 6);
            heading.x_align = Clutter.ActorAlign.CENTER;
            heading.add_child(icon(iconName));
            heading.add_child(label(title));
            const value = label('—', 'notch-value');
            const detail = wrapLabel('Waiting for sample', 'notch-muted', true);
            card.add_child(heading);
            card.add_child(value);
            card.add_child(detail);
            this.statCards[id] = card;
            this.stats[id] = {value, detail};
        }
        page.add_child(this.statsGrid);
        page.add_child(label('QUICK ACTIONS', 'notch-section-label'));
        this.actionsRow = box(false, 'notch-actions-row', 8);
        this.actionsRow.x_align = Clutter.ActorAlign.CENTER;
        page.add_child(this.actionsRow);
        page.add_child(wrapLabel('Sampling runs only while this page is visible.', 'notch-page-subtitle', true));
        this.updateActions();
        return page;
    }

    updateSystem() {
        if (this.dead || !this.stats) return;
        const values = this.diagnostics.values;
        const battery = values?.battery ?? this.diagnostics.battery;
        if (values) {
            setText(this.stats.cpu.value, values.cpu.percent === null ? '…' : `${Math.round(values.cpu.percent)}%`);
            setText(this.stats.cpu.detail, 'All logical processors');
            setText(this.stats.ram.value, values.memory.percent === null ? '—' : `${Math.round(values.memory.percent)}%`);
            setText(this.stats.ram.detail, values.memory.used === null ? 'Unavailable' :
                `${formatBytes(values.memory.used)} / ${formatBytes(values.memory.total)}`);
            setText(this.stats.network.value, values.network.download === null ? '…' :
                `↓ ${formatBytes(values.network.download, '/s')}`);
            setText(this.stats.network.detail, values.network.upload === null ?
                (values.network.raw?.interface || 'No interface') :
                `↑ ${formatBytes(values.network.upload, '/s')} · ${values.network.raw?.interface}`);
        }
        setText(this.stats.battery.value, battery.available ? `${Math.round(battery.percent)}%` : 'AC');
        const states = {0: 'Unknown', 1: 'Charging', 2: 'Discharging', 3: 'Empty', 4: 'Fully charged',
            5: 'Pending charge', 6: 'Pending discharge'};
        setText(this.stats.battery.detail, battery.available ?
            `${states[battery.state] ?? 'Unknown'}${battery.watts ? ` · ${battery.watts.toFixed(1)} W` : ''}` :
            'No system battery');
    }

    updateActions() {
        if (this.dead || !this.actionsRow) return;
        const signature = this.actions.items.map(item => item.id).join(',');
        if (this._actionSignature !== signature) {
            this._actionSignature = signature;
            this.actionsRow.destroy_all_children();
            this.actionButtons = [];
            for (const item of this.actions.items) {
                const widget = button({text: item.label, iconName: item.icon, style: 'notch-action',
                    accessibleName: item.label, onClick: () => this.toggleAction(item)});
                this.actionsRow.add_child(widget);
                this.actionButtons.push({item, widget});
            }
            if (!this.actions.items.length)
                this.actionsRow.add_child(wrapLabel('Enable quick actions in Notch Settings.'));
        }
        this.syncActions();
    }

    syncActions() {
        for (const {item, widget, compact} of this.actionButtons ?? []) {
            const active = this.actions.snapshot(item);
            const writable = this.actions.writable(item);
            for (const target of [widget, compact]) {
                if (!target) continue;
                target.reactive = writable;
                target.accessible_name = `${item.label}: ${active ? 'on' : 'off'}${writable ? '' : ', locked'}`;
                if (active) target.add_style_class_name('notch-action-active');
                else target.remove_style_class_name('notch-action-active');
            }
        }
    }

    toggleAction(item) {
        const result = this.actions.toggle(item);
        this.syncActions();
        if (result.ok)
            this.showStatus(`${result.label} ${result.active ? 'on' : 'off'}`, {timeout: 2200});
        else
            this.showError(result.error || `${result.label} could not be changed.`);
    }


    buildShelf() {
        const page = pageBox('notch-shelf-page', 10);
        const titleRow = box(false, 'notch-page-header', 8);
        titleRow.x_align = Clutter.ActorAlign.CENTER;
        titleRow.add_child(label('Quick stash', 'notch-title', true));
        this.shelfCount = label('0 files');
        titleRow.add_child(this.shelfCount);
        page.add_child(titleRow);
        const actions = box(false, 'notch-page-actions', 8);
        actions.x_align = Clutter.ActorAlign.CENTER;
        this.shelfAdd = button({text: 'Add files', iconName: 'list-add-symbolic', style: 'notch-small-button',
            onClick: () => this.shelf.choose()});
        this.shelfClear = button({text: 'Clear', iconName: 'edit-clear-all-symbolic', style: 'notch-small-button',
            accessibleName: 'Clear shelf references', onClick: () => {
                this.shelf.clear().then(ok => { if (ok) this.showStatus('Shelf references cleared.', {timeout: 1800}); });
            }});
        this.shelfRetry = button({text: 'Retry', iconName: 'view-refresh-symbolic', style: 'notch-small-button',
            accessibleName: 'Retry file shelf helper', onClick: () => this.retryShelf()});
        actions.add_child(this.shelfAdd);
        actions.add_child(this.shelfClear);
        actions.add_child(this.shelfRetry);
        page.add_child(actions);
        this.shelfStatus = wrapLabel('Drop files near the notch, or add them here. Originals stay in place.', 'notch-page-subtitle', true);
        page.add_child(this.shelfStatus);
        this.shelfList = box(true, 'notch-list', 8);
        this.shelfList.x_expand = true;
        page.add_child(this.shelfList);
        const pager = box(false, 'notch-pager', 10);
        pager.x_align = Clutter.ActorAlign.CENTER;
        this.shelfPager = pager;
        this.shelfPrev = button({iconName: 'go-previous-symbolic', style: 'notch-icon-button',
            accessibleName: 'Previous shelf page', onClick: () => { this.shelfPage--; this.updateShelf(); }});
        this.shelfPageLabel = label('1 / 1', 'notch-muted');
        this.shelfNext = button({iconName: 'go-next-symbolic', style: 'notch-icon-button',
            accessibleName: 'Next shelf page', onClick: () => { this.shelfPage++; this.updateShelf(); }});
        pager.add_child(this.shelfPrev);
        pager.add_child(this.shelfPageLabel);
        pager.add_child(this.shelfNext);
        page.add_child(pager);
        return page;
    }

    retryShelf() {
        this.shelfRetry.reactive = false;
        setText(this.shelfRetry._notchLabel, 'Starting…');
        this.shelf.start().then(ok => {
            if (this.dead) return;
            this.shelfRetry.reactive = true;
            setText(this.shelfRetry._notchLabel, 'Retry');
            if (ok) this.showStatus('File shelf connected.', {timeout: 2200});
            else this.showError(this.shelf.lastError || 'File shelf helper could not start. Run notch-doctor.');
        });
    }


    updateShelf() {
        if (this.dead || !this.shelfList) return;
        this.shelfList.destroy_all_children();
        const state = this.shelf.state;
        const items = this.shelf.items;
        setText(this.shelfCount, `${items.length} file${items.length === 1 ? '' : 's'}`);
        setText(this.shelfStatus, state === 'ready' ?
            'Drop files near the notch, or add them here. Originals stay in place.' :
            state === 'starting' ? 'Starting file shelf helper…' :
                (this.shelf.lastError || 'File shelf helper is offline. Press Retry to start it.'));
        this.shelfRetry.visible = state !== 'ready';
        this.shelfRetry.reactive = state !== 'starting';
        setSensitive(this.shelfClear, state === 'ready' && items.length > 0);
        const slice = pageSlice(items, this.shelfPage, PAGE_CAPACITY.shelf);
        this.shelfPage = slice.page;
        setText(this.shelfPageLabel, pageLabel(slice.page, slice.totalPages));
        this.shelfPager.visible = slice.totalPages > 1;
        setSensitive(this.shelfPrev, slice.hasPrevious);
        setSensitive(this.shelfNext, slice.hasNext);
        if (!items.length) {
            this.shelfList.add_child(emptyState('folder-symbolic', 'Shelf is empty',
                state === 'ready' ? 'Stash a few files for later. Originals stay in place.' :
                    'Files appear here once the helper is connected.'));
            return;
        }
        for (const item of slice.items) {
            const row = box(true, 'notch-row notch-file-row', 6);
            row.x_expand = true;
            const open = button({text: item.name, iconName: 'text-x-generic-symbolic', wrapText: true,
                style: 'notch-button notch-file-open', onClick: () => this.shelf.open(item.uri),
                accessibleName: `Open ${item.name}`});
            open.x_expand = true;
            row.add_child(open);
            const actions = box(false, 'notch-file-actions', 6);
            actions.x_align = Clutter.ActorAlign.CENTER;
            actions.add_child(button({iconName: 'edit-copy-symbolic', style: 'notch-icon-button',
                accessibleName: `Copy URI of ${item.name}`, onClick: () => {
                    this.shelf.copy(item.uri).then(ok => { if (ok) this.showStatus('File URI copied.', {timeout: 1800}); });
                }}));
            actions.add_child(button({iconName: 'folder-open-symbolic', style: 'notch-icon-button',
                accessibleName: `Reveal ${item.name}`, onClick: () => this.shelf.reveal(item.uri)}));
            actions.add_child(button({iconName: 'user-trash-symbolic', style: 'notch-icon-button',
                accessibleName: `Remove ${item.name} from shelf`, onClick: () => {
                    this.shelf.remove(item.uri).then(ok => { if (ok) this.showStatus('Removed from shelf.', {timeout: 1800}); });
                }}));
            row.add_child(actions);
            this.shelfList.add_child(row);
        }
    }




    buildClipboard() {
        const page = pageBox('notch-clipboard-page', 10);
        this.clipboardStatus = label('Clipboard', 'notch-title', true);
        page.add_child(this.clipboardStatus);
        const actions = box(false, 'notch-page-actions', 8);
        actions.x_align = Clutter.ActorAlign.CENTER;
        this.clipboardCapture = button({text: 'Capture now', iconName: 'edit-paste-symbolic', style: 'notch-small-button',
            onClick: async () => {
                const ok = await this.clipboard.capture();
                this.showStatus(ok ? 'Clipboard captured.' : 'No eligible plain-text clipboard item found.', {timeout: 2400});
            }});
        this.clipboardClear = button({text: 'Clear history', iconName: 'edit-clear-all-symbolic', style: 'notch-small-button',
            onClick: () => {
                this.clipboard.clear();
                this.showStatus('Clipboard history cleared.', {timeout: 1800});
            }});
        actions.add_child(this.clipboardCapture);
        actions.add_child(this.clipboardClear);
        page.add_child(actions);
        page.add_child(wrapLabel('RAM only. Cleared on lock/logout. Password-manager clips are skipped when detected.', 'notch-page-subtitle', true));
        this.clipboardList = box(true, 'notch-list', 8);
        this.clipboardList.x_expand = true;
        page.add_child(this.clipboardList);
        const pager = box(false, 'notch-pager', 10);
        pager.x_align = Clutter.ActorAlign.CENTER;
        this.clipboardPager = pager;
        this.clipboardPrev = button({iconName: 'go-previous-symbolic', style: 'notch-icon-button',
            accessibleName: 'Previous clipboard page', onClick: () => { this.clipboardPage--; this.updateClipboard(); }});
        this.clipboardPageLabel = label('1 / 1', 'notch-muted');
        this.clipboardNext = button({iconName: 'go-next-symbolic', style: 'notch-icon-button',
            accessibleName: 'Next clipboard page', onClick: () => { this.clipboardPage++; this.updateClipboard(); }});
        pager.add_child(this.clipboardPrev);
        pager.add_child(this.clipboardPageLabel);
        pager.add_child(this.clipboardNext);
        page.add_child(pager);
        return page;
    }


    updateClipboard() {
        if (this.dead || !this.clipboardList) return;
        const enabled = this.settings.get_boolean('clipboard-enabled');
        const items = this.clipboard.history.items;
        setText(this.clipboardStatus, enabled ? 'Clipboard · on' : 'Clipboard · manual');
        setSensitive(this.clipboardClear, items.length > 0);
        this.clipboardList.destroy_all_children();
        const slice = pageSlice(items, this.clipboardPage, PAGE_CAPACITY.clipboard);
        this.clipboardPage = slice.page;
        setText(this.clipboardPageLabel, pageLabel(slice.page, slice.totalPages));
        this.clipboardPager.visible = slice.totalPages > 1;
        setSensitive(this.clipboardPrev, slice.hasPrevious);
        setSensitive(this.clipboardNext, slice.hasNext);
        if (!items.length) {
            this.clipboardList.add_child(emptyState('edit-paste-symbolic', 'No clipboard history',
                enabled ? 'Copy plain text to begin.' :
                    'Enable automatic history in Settings, or capture the current text explicitly.'));
            return;
        }
        for (const item of slice.items) {
            const row = box(true, 'notch-row notch-clip-row', 6);
            row.x_expand = true;
            const normalized = item.text.replace(/\s+/g, ' ').trim();
            const preview = normalized.length > 140 ? `${normalized.slice(0, 140)}…` : normalized;
            const copy = button({text: preview, iconName: 'edit-paste-symbolic', wrapText: true,
                style: 'notch-button notch-clip-copy', accessibleName: 'Restore this clipboard entry',
                onClick: () => {
                    if (this.clipboard.restore(item.id)) this.showStatus('Copied to clipboard.', {timeout: 1800});
                }});
            copy.x_expand = true;
            row.add_child(copy);
            const meta = label(new Date(item.now).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}), 'notch-page-subtitle');
            row.add_child(meta);
            this.clipboardList.add_child(row);
        }
    }

    showStatus(message, {timeout = 0, actionLabel = '', onAction = null} = {}) {
        if (this.dead || !this.statusLabel) return;
        this.clearTimer('statusTimer');
        this._statusToken = (this._statusToken ?? 0) + 1;
        setText(this.statusLabel, message);
        this.statusLabel.remove_style_class_name('notch-status-error');
        const wasVisible = this.statusBar.visible;
        this.statusBar.visible = !!message;
        if (message) {
            this.statusBar.remove_all_transitions();
            this.statusBar.opacity = 255;
            this.statusBar.set_translation(0, 0, 0);
        }
        if (message && !wasVisible) {
            this.statusBar.opacity = 0;
            this.statusBar.set_translation(0, 4, 0);
            this.statusBar.ease({opacity: 255, translation_y: 0, duration: this.motionDuration(140), mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        }
        this.statusAction = onAction;
        this.statusActionButton.visible = !!actionLabel && !!onAction;
        setText(this.statusActionButton._notchLabel, actionLabel);
        if (this.actor) this.relayout('resize');
        else this.layoutPages();
        if (timeout > 0) this.setTimer('statusTimer', timeout, () => this.clearStatus());
    }

    clearStatus() {
        this.clearTimer('statusTimer');
        const token = this._statusToken = (this._statusToken ?? 0) + 1;
        this.statusAction = null;
        if (this.statusBar?.visible) {
            this.statusBar.remove_all_transitions();
            const duration = this.motionDuration(100);
            if (duration) {
                this.statusBar.ease({opacity: 0, translation_y: 4, duration, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onStopped: () => {
                        if (this.dead || token !== this._statusToken || this.statusBar.opacity > 0) return;
                        this.statusBar.visible = false;
                        if (this.actor) this.relayout('resize');
                    }});
                return;
            }
            this.statusBar.visible = false;
        }
        if (this.actor) this.relayout('resize');
    }

    showError(message) {
        if (this.dead) return;
        const text = /Invalid GType|set_gtypes|GType/i.test(String(message ?? '')) ?
            helperErrorMessage(message) : String(message ?? '');
        this.lastError = text;
        const shelfError = /shelf|helper/i.test(text);
        this.showStatus(text, shelfError ? {actionLabel: 'Retry', onAction: () => this.retryShelf()} : {});
        this.statusLabel.add_style_class_name('notch-status-error');
    }

    state() {
        return JSON.stringify({version: '0.1.0', extensionVersion: this.extension.metadata.version, mode: this.mode, expanded: this.expanded, visible: this.allowed,
            media: this.media.snapshot().identity, clipboardCount: this.clipboard.history.items.length,
            shelfCount: this.shelf.items.length, shelfState: this.shelf.state, notificationCount: countNotifications(Main.messageTray.getSources()),
            activeNotification: !!this.notifications?.active});
    }

    destroy() {
        this.dead = true;
        for (const name of ['hoverTimer', 'closeTimer', 'hideTimer', 'mediaTimer', 'peekTimer', 'statusTimer']) this.clearTimer(name);
        this.stopTimeline();
        this.stopVisualizer();
        this.injections?.clear();
        this.content?.remove_all_transitions();
        this.closedLayer?.remove_all_transitions();
        this.peek?.remove_all_transitions();
        this.statusBar?.remove_all_transitions();
        for (const page of Object.values(this.pageContainers ?? {})) page.remove_all_transitions();
        this.notificationScroll?.remove_all_transitions();
        this.notifications?.destroy();
        this.clock?.disconnectObject(this);
        this.interfaceSettings?.disconnectObject(this);
        if (this.clockHidden) {
            const container = Main.panel.statusArea.dateMenu?.container;
            if (container) {
                container.opacity = this.clockOriginal?.opacity ?? 255;
                container.reactive = this.clockOriginal?.reactive ?? true;
            }
            this.clockHidden = false;
        }
        if (this.stagePress) global.stage.disconnect(this.stagePress);
        if (this.screenSignal) Gio.DBus.session.signal_unsubscribe(this.screenSignal);
        this.screenSignal = 0;
        this.settings?.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        global.display.disconnectObject(this);
        this.dnd?.disconnectObject(this);
        this.endDrag();
        this.media?.destroy();
        this.diagnostics?.destroy();
        this.clipboard?.destroy();
        this.shelf?.destroy();
        this.actions?.destroy();
        if (this.reserve) Main.layoutManager.removeChrome(this.reserve);
        this.reserve?.destroy();
        if (this.actor) {
            Main.layoutManager.removeChrome(this.actor);
            this.actor.disconnectObject(this);
            this.actor.destroy();
        }
        this.pages = null;
        this.stats = null;
        this._helperActor?.disconnectObject(this);
        this._helperWatched?.disconnectObject(this);
        this._helperActor = null;
        this._helperWatched = null;
        this.helperWindow = null;
    }
}
