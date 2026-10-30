import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Urgency} from 'resource:///org/gnome/shell/ui/messageTray.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AudioController} from './audio.js';
import {ArtLoader} from './art.js';
import {ClipboardController} from './clipboard.js';
import {Diagnostics} from './diagnostics.js';
import {notchGeometry, containsPoint, PAGE_SIZES} from './geometry.js';
import {MediaController} from './media.js';
import {NotificationBridge} from './notifications.js';
import {QuickActions} from './actions.js';
import {ShelfController} from './shelf.js';
import {SpringGeometry, SPRING_PROFILES, easeOutCubic, interpolateGeometry} from './spring.js';
import {NotchSurface} from './surface.js';
import {box, button, icon, label, setText, slider} from './widgets.js';
import {formatBytes, formatTime, plainText} from './model.js';

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
        this.peekNotification = null;
        this.clockHidden = false;
        this.options = this.readOptions();
        this.media = new MediaController(this.directory, () => this.updateMedia(), e => this.showError(e));
        this.audio = new AudioController(() => this.updateAudio());
        this.diagnostics = new Diagnostics(this.directory, () => this.updateSystem());
        this.art = new ArtLoader(this.settings.get_boolean('remote-art'));
        this.actions = new QuickActions(this.settings, () => this.updateActions());
        this.clipboard = new ClipboardController(this.settings.get_int('clipboard-limit'), () => this.updateClipboard());
        this.shelf = new ShelfController(this.directory, () => this.updateShelf(), e => this.showError(e));
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
        this.shelf.start();
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
        const textScale = this.interfaceSettings.get_double('text-scaling-factor') || 1;
        const layoutScale = Math.max(0.75, Math.min(1.5, this.settings.get_double('notch-scale'))) *
            Math.max(0.8, Math.min(2, textScale));
        return {
            cssScale, layoutScale,
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
        this.liveArt = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 20,
            style_class: 'notch-live-art', y_align: Clutter.ActorAlign.CENTER});
        this.liveBars = box(false, 'notch-live-bars', 2);
        this.liveBars.y_align = Clutter.ActorAlign.CENTER;
        this.barWidgets = [6, 12, 8].map(height => {
            const bar = new St.Widget({style_class: 'notch-live-bar', style: `height: ${height}px;`});
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
        leftWing.add_child(this.liveArt);
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
        this.header = box(false, 'notch-header', 4);
        this.tabButtons = new Map();
        for (const [id, title, iconName] of TABS) {
            const tab = button({text: title, iconName, style: 'notch-tab', accessibleName: title,
                onClick: () => this.selectTab(id)});
            this.header.add_child(tab);
            this.tabButtons.set(id, tab);
        }
        const spacer = new St.Widget({x_expand: true});
        this.header.add_child(spacer);
        this.header.add_child(button({iconName: 'emblem-system-symbolic', style: 'notch-icon-button',
            accessibleName: 'Notch settings', onClick: () => this.extension.openPreferences()}));
        this.header.add_child(button({iconName: 'window-close-symbolic', style: 'notch-icon-button',
            accessibleName: 'Close notch', onClick: () => this.setExpanded(false)}));
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
        for (const page of Object.values(this.pages)) this.pageStack.add_child(page);
        this.content.add_child(this.pageStack);
        this.statusLabel = label('', 'notch-status');
        this.content.add_child(this.statusLabel);
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
        const stack = new St.Widget({layout_manager: new Clutter.BinLayout()});
        this.homeMedia = box(false, 'notch-home-media', 14);
        this.homeArt = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 72,
            style_class: 'notch-art', y_align: Clutter.ActorAlign.CENTER});
        const info = box(true, '', 5);
        info.x_expand = true;
        info.y_align = Clutter.ActorAlign.CENTER;
        this.homeTitle = label('Nothing playing', 'notch-home-title', true);
        this.homeArtist = label('Start a song in an MPRIS-compatible player');
        const controls = box(false, '', 8);
        this.homePrevious = button({iconName: 'media-skip-backward-symbolic', style: 'notch-icon-button',
            accessibleName: 'Previous track', onClick: () => this.media.previous()});
        this.homePlay = button({iconName: 'media-playback-start-symbolic', style: 'notch-button notch-play',
            accessibleName: 'Play or pause', onClick: () => this.media.playPause()});
        this.homeNext = button({iconName: 'media-skip-forward-symbolic', style: 'notch-icon-button',
            accessibleName: 'Next track', onClick: () => this.media.next()});
        controls.add_child(this.homePrevious);
        controls.add_child(this.homePlay);
        controls.add_child(this.homeNext);
        controls.add_child(button({text: 'Full player', style: 'notch-link',
            onClick: () => this.selectTab('media')}));
        info.add_child(this.homeTitle);
        info.add_child(this.homeArtist);
        info.add_child(controls);
        this.homeMedia.add_child(this.homeArt);
        this.homeMedia.add_child(info);
        stack.add_child(this.homeMedia);

        this.homeIdle = box(false, 'notch-home-idle', 18);
        const timeBox = box(true, '', 2);
        timeBox.x_expand = true;
        timeBox.y_align = Clutter.ActorAlign.CENTER;
        this.homeClock = label('', 'notch-home-clock');
        this.homeDate = label('', 'notch-home-date');
        timeBox.add_child(this.homeClock);
        timeBox.add_child(this.homeDate);
        this.homeActions = box(false, '', 8);
        this.homeActions.x_align = Clutter.ActorAlign.END;
        this.homeActions.y_align = Clutter.ActorAlign.CENTER;
        this.homeIdle.add_child(timeBox);
        this.homeIdle.add_child(this.homeActions);
        stack.add_child(this.homeIdle);
        return stack;
    }

    buildNotifications() {
        const page = box(true, '', 8);
        const header = box(false, '', 8);
        this.notificationCount = label('0 notifications', 'notch-title', true);
        header.add_child(this.notificationCount);
        header.add_child(button({text: 'Clear all', iconName: 'edit-clear-all-symbolic',
            onClick: () => this.clearNotifications()}));
        page.add_child(header);
        this.calendarLabel = label(new Date().toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'}), 'notch-muted');
        page.add_child(this.calendarLabel);
        this.notificationList = box(true, '', 6);
        this.notificationList.x_expand = true;
        const scroll = new St.ScrollView({style_class: 'notch-scroll', hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, y_expand: true});
        scroll.add_child(this.notificationList);
        page.add_child(scroll);
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
        const image = new St.Icon({gicon, icon_name: gicon ? null : 'preferences-system-notifications-symbolic',
            icon_size: 32, style_class: 'notch-peek-icon', y_align: Clutter.ActorAlign.START});
        const text = box(true, '', 2);
        text.x_expand = true;
        const title = label(plainText(notification.title || notification.source?.title || 'Notification'),
            'notch-peek-title', true);
        const body = label(plainText(notification.body || ''), 'notch-peek-body', true);
        body.clutter_text.line_wrap = true;
        body.clutter_text.line_wrap_mode = 2;
        body.clutter_text.ellipsize = 0;
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
        this.closedLayer.opacity = 0;
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
        this.peek.visible = false;
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
        const count = this.notifications?.count ?? 0;
        setText(this.notificationCount, `${count} notification${count === 1 ? '' : 's'}`);
        this.unreadDot.visible = count > 0 && this.settings.get_boolean('idle-clock');
        const tab = this.tabButtons.get('notifications');
        if (tab) tab.child.get_last_child().text = count ? `Alerts ${count}` : 'Alerts';
    }

    updateNotifications() {
        if (this.dead || !this.notificationList) return;
        this.updateNotificationCount();
        setText(this.calendarLabel, new Date().toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'}));
        this.notificationList.destroy_all_children();
        const sources = Main.messageTray.getSources();
        let total = 0;
        for (const source of sources) {
            for (const notification of source.notifications) {
                total++;
                const row = box(false, 'notch-notification', 8);
                const gicon = notification.gicon ?? source.icon ?? null;
                row.add_child(new St.Icon({gicon, icon_name: gicon ? null : 'application-x-executable-symbolic',
                    icon_size: 24, y_align: Clutter.ActorAlign.START}));
                const text = box(true, '', 2);
                text.x_expand = true;
                text.add_child(label(plainText(notification.title || source.title), 'notch-title', true));
                const body = label(plainText(notification.body || ''), 'notch-muted', true);
                body.clutter_text.line_wrap = true;
                body.clutter_text.line_wrap_mode = 2;
                body.clutter_text.ellipsize = 0;
                text.add_child(body);
                row.add_child(text);
                const actions = box(true, '', 4);
                for (const action of (notification.actions ?? []).slice(0, 2)) {
                    actions.add_child(button({text: plainText(action.label), style: 'notch-small-button',
                        onClick: () => action.activate()}));
                }
                actions.add_child(button({iconName: 'user-trash-symbolic', style: 'notch-icon-button',
                    accessibleName: 'Dismiss notification', onClick: () => notification.destroy()}));
                row.add_child(actions);
                this.notificationList.add_child(row);
            }
        }
        if (!total) this.notificationList.add_child(label('No notifications. New alerts will peek here.'));
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

    updateHome(state) {
        const playing = state.names.length > 0;
        this.homeMedia.visible = playing;
        this.homeIdle.visible = !playing;
        if (!playing) return;
        setText(this.homeTitle, state.title);
        setText(this.homeArtist, state.artist || state.identity);
        this.homePrevious.reactive = state.canGoPrevious;
        this.homeNext.reactive = state.canGoNext;
        this.homePlay.reactive = state.canControl && (state.canPlay || state.canPause);
        this.homePlay.child.get_last_child().icon_name = state.status === 'Playing' ?
            'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
    }

    updateSummary() {
        if (this.dead || !this.liveArt) return;
        const state = this.media.snapshot();
        const show = this.settings.get_boolean('closed-media') && state.names.length > 0 && state.status !== 'Stopped';
        this.liveArt.visible = show;
        this.liveBars.visible = show && state.status === 'Playing';
        this.summaryClock.visible = this.settings.get_boolean('idle-clock');
        this.unreadDot.visible = (this.notifications?.count ?? 0) > 0 && this.settings.get_boolean('idle-clock');
        if (show) {
            const key = `${state.artUrl}|${this.settings.get_boolean('remote-art')}`;
            if (key !== this.liveArtKey) {
                this.liveArtKey = key;
                this.art.load(state.artUrl, gicon => {
                    if (this.dead) return;
                    this.liveArt.gicon = gicon;
                    this.liveArt.icon_name = gicon ? null : 'audio-x-generic-symbolic';
                    this.homeArt.gicon = gicon;
                    this.homeArt.icon_name = gicon ? null : 'audio-x-generic-symbolic';
                });
            }
        }
        this.syncVisualizer();
        const previous = this.options.mediaWings;
        this.options.mediaWings = this.settings.get_boolean('closed-media') && show;
        if (previous !== this.options.mediaWings) this.relayout('resize');
    }

    syncVisualizer() {
        const active = this.allowed && this.mode === 'closed' && this.liveBars?.visible &&
            this.settings.get_boolean('animations') && !!St.Settings.get().enable_animations;
        if (active && !this.visualTimer) {
            this.visualTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 240, () => {
                if (this.dead) return GLib.SOURCE_REMOVE;
                const patterns = [[6, 12, 8], [12, 7, 13], [8, 14, 6], [13, 8, 11]];
                this.visualStep = (this.visualStep + 1) % patterns.length;
                this.barWidgets.forEach((bar, index) => {
                    bar.style = `height: ${patterns[this.visualStep][index]}px;`;
                });
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!active && this.visualTimer) {
            GLib.source_remove(this.visualTimer);
            this.visualTimer = 0;
        }
    }

    selectTab(id, animate = true) {
        if (!this.pages[id]) return;
        this.tab = id;
        this.options.tab = id;
        for (const [pageId, page] of Object.entries(this.pages)) page.visible = pageId === id;
        for (const [tabId, tab] of this.tabButtons) {
            if (tabId === id) tab.add_style_class_name('notch-tab-active');
            else tab.remove_style_class_name('notch-tab-active');
        }
        this.diagnostics.setActive(id === 'system' && this.expanded && this.allowed);
        this.media.setPositionActive(id === 'media' && this.expanded && this.allowed);
        if (id === 'notifications') this.updateNotifications();
        if (id === 'system') this.updateSystem();
        if (id === 'shelf') this.updateShelf();
        if (id === 'clipboard') this.updateClipboard();
        this.layoutPages();
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
            this.content.ease({opacity: 255, duration: this.motionDuration(180), delay: this.motionDuration(70),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            this.closedLayer.remove_all_transitions();
            this.closedLayer.ease({opacity: 0, duration: this.motionDuration(100), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            this.selectTab(this.tab, false);
            this.relayout('open');
        } else {
            this.mode = 'closed';
            this.peek.visible = false;
            this.peekNotification = null;
            this.notifications?.release();
            this.content.remove_all_transitions();
            this.content.ease({opacity: 0, duration: this.motionDuration(90), mode: Clutter.AnimationMode.EASE_OUT_QUAD,
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
        const page = PAGE_SIZES[this.tab] ?? PAGE_SIZES.home;
        const css = this.options.cssScale;
        const panelLogical = this.options.panelHeight / (css * this.options.layoutScale);
        const width = Math.max(280, Math.min(page.width, this.options.expandedWidth) - 40);
        const height = Math.max(90, Math.min(page.height, this.options.expandedHeight) - panelLogical - 16);
        this._contentLogicalWidth = width;
        this.content.set_size(width * css, height * css);
        this.header.set_size(width * css, 32 * css);
        this.statusLabel.set_size(width * css, 14 * css);
        this.pageStack.set_size(width * css, Math.max(40, height - 46) * css);
    }

    relayout(kind = 'resize', immediate = false) {
        if (this.dead || !this.actor) return;
        this.options = {...this.options, ...this.readOptions(), tab: this.tab,
            mediaWings: this.settings.get_boolean('closed-media') && this.hasMediaWings(),
            hovered: this.hovered && this.mode === 'closed'};
        const rect = this.geometry(this.expanded, this.mode);
        this.layoutPages();
        this.animateTo(rect, kind, immediate);
        if (this.reserve) this.updateReserve();
        if (this.shelf.dropVisible) {
            this.shelf.hideDropTarget();
            this.shelf.showDropTarget(this.dropRectangle());
            this.placeHelper();
        }
    }

    animateTo(rect, kind, immediate) {
        const key = JSON.stringify(rect);
        if (this._targetKey === key && this.springs && !immediate) return;
        this._targetKey = key;
        this.stopTimeline();
        if (!this.springs) this.springs = new SpringGeometry(rect);
        const animated = this.settings.get_boolean('animations') && !!St.Settings.get().enable_animations && !immediate;
        if (!animated) {
            this.springs.snap(rect);
            this.applyGeometry(rect);
            return;
        }
        const smooth = this.settings.get_string('animation-profile') === 'smooth';
        const profile = SPRING_PROFILES[kind] ?? SPRING_PROFILES.resize;
        const from = Object.fromEntries(Object.entries(this.springs.springs).map(([k, s]) => [k, s.value]));
        const duration = smooth ? this.settings.get_int(kind === 'close' ? 'close-animation-ms' : 'open-animation-ms') : 1400;
        this.springs.setTarget(rect, profile);
        this._animation = {smooth, from, to: rect, duration: Math.max(1, duration), last: 0};
        this.timeline = new Clutter.Timeline({duration: Math.max(1, duration), repeat_count: -1, actor: this.actor});
        this.timeline.connectObject('new-frame', (_timeline, elapsed) => {
            if (this.dead || !this._animation) return;
            const state = this._animation;
            let next;
            if (state.smooth) {
                const progress = easeOutCubic(elapsed / state.duration);
                next = interpolateGeometry(state.from, state.to, progress);
            } else {
                const dt = Math.max(0, (elapsed - state.last) / 1000);
                state.last = elapsed;
                next = this.springs.step(dt);
            }
            this.applyGeometry(next);
            if ((state.smooth && elapsed >= state.duration) || (!state.smooth && this.springs.settled) || elapsed > 2000) {
                this.springs.snap(rect);
                this.applyGeometry(rect);
                this.stopTimeline();
            }
        }, this);
        this.timeline.start();
    }

    stopTimeline() {
        if (!this.timeline) return;
        this.timeline.stop();
        this.timeline.disconnectObject(this);
        this.timeline = null;
        this._animation = null;
    }

    applyGeometry(rect) {
        const scale = this.options.cssScale * this.options.layoutScale;
        const layout = this.options.layoutScale;
        this.actor.set_position(Math.round(rect.x), Math.round(rect.y));
        this.actor.set_size(Math.round(rect.width), Math.round(rect.height));
        this.surface.setGeometry(rect.width, rect.height, rect.topRadius, rect.bottomRadius, this.options.cssScale);
        this.surface.opacity = Math.round(this.options.opacity * 255);
        const panelHeight = this.options.panelHeight;
        this.closedLayer.set_size(rect.width / layout, panelHeight / layout);
        this.closedLayer.set_scale(layout, layout);
        this.closedLayer.set_position(0, 0);
        const page = PAGE_SIZES[this.tab] ?? PAGE_SIZES.home;
        const contentWidth = (this._contentLogicalWidth ?? (page.width - 40)) * scale;
        this.content.set_scale(layout, layout);
        this.content.set_position(Math.round((rect.width - contentWidth) / 2), panelHeight);
        this.peek.set_scale(layout, layout);
        this.peek.set_size((rect.width - 32 * scale) / layout, (rect.height - panelHeight - 12 * scale) / layout);
        this.peek.set_position(16 * scale, panelHeight + 4 * scale);
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
        this.dnd.connectObject('dnd-position-change', (_dnd, x, y) => this.dragPosition(x, y),
            'dnd-leave', () => this.endDrag(), this);
        global.display.connectObject('window-created', (_display, window) => {
            if (this.isHelper(window)) this.helperWindow = window;
        }, this);
        this.helperWindow = global.get_window_actors().map(a => a.meta_window).find(w => this.isHelper(w));
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
        if (!this.allowed || !this.shelf.ready) return;
        const target = this.dropRectangle();
        const monitor = this.monitor();
        const near = x >= target.x - 60 && x <= target.x + target.width + 60 &&
            y >= monitor.y && y <= target.y + target.height + 40;
        if (near) {
            this.externalDrag = true;
            this.clearTimer('hideTimer');
            this.setExpanded(false);
            this.selectTab('shelf', false);
            this.shelf.showDropTarget(target);
            this.placeHelper();
        } else { this.endDrag(); }
    }

    dropRectangle() {
        const expanded = this.geometry(true);
        const scale = this.options.cssScale * this.options.layoutScale;
        const top = this.options.panelHeight;
        return {x: expanded.x + 20 * scale, y: expanded.y + top + 40 * scale,
            width: Math.max(160, expanded.width - 40 * scale),
            height: Math.max(100, expanded.height - top - 56 * scale)};
    }

    placeHelper() {
        const window = this.helperWindow ??
            global.get_window_actors().map(a => a.meta_window).find(w => this.isHelper(w));
        if (!window || !this.shelf.dropVisible) return;
        this.helperWindow = window;
        const rect = this.dropRectangle();
        const mapped = !!window.get_compositor_private()?.visible;
        const key = `${rect.x},${rect.y},${rect.width},${rect.height},${mapped}`;
        if (this.placedHelperKey === key) return;
        this.placedHelperKey = key;
        // Mutter, not the unprivileged GTK client, positions this temporary surface.
        window.make_above();
        window.stick();
        window.move_frame(true, rect.x, rect.y);
        window.raise();
    }

    endDrag() {
        this.externalDrag = false;
        this.placedHelperKey = null;
        this.shelf?.hideDropTarget();
        if (this.helperWindow) {
            this.helperWindow.unmake_above();
            this.helperWindow.unstick();
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
        if (key === 'remote-art') {
            this.art.setAllowRemote(this.settings.get_boolean('remote-art'));
            this.artKey = null;
            this.updateMedia();
        }
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
        this.actor.visible = this.allowed;
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
        const page = box(true, '', 8);
        const row = box(false, '', 14);
        this.mediaArt = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 72,
            style_class: 'notch-art', y_align: Clutter.ActorAlign.CENTER});
        row.add_child(this.mediaArt);
        const info = box(true, '', 4);
        info.x_expand = true;
        this.mediaTitle = label('Nothing playing', 'notch-title', true);
        this.mediaArtist = label('Start a song in an MPRIS-compatible player');
        this.mediaAlbum = label('');
        this.mediaPlayer = button({text: 'No media player', iconName: 'view-more-symbolic',
            accessibleName: 'Switch media player', onClick: () => this.media.cyclePlayer()});
        info.add_child(this.mediaTitle);
        info.add_child(this.mediaArtist);
        info.add_child(this.mediaAlbum);
        info.add_child(this.mediaPlayer);
        row.add_child(info);
        page.add_child(row);
        const progress = box(false, '', 8);
        this.mediaElapsed = label('0:00');
        this.mediaSeek = slider(0, value => this.media.seekTo(value), 'Playback position');
        this.mediaDuration = label('0:00');
        progress.add_child(this.mediaElapsed);
        progress.add_child(this.mediaSeek);
        progress.add_child(this.mediaDuration);
        page.add_child(progress);
        const controls = box(false, '', 10);
        controls.x_align = Clutter.ActorAlign.CENTER;
        this.mediaPrevious = button({iconName: 'media-skip-backward-symbolic', accessibleName: 'Previous track',
            onClick: () => this.media.previous()});
        this.mediaPlay = button({iconName: 'media-playback-start-symbolic', accessibleName: 'Play or pause',
            style: 'notch-button notch-play', onClick: () => this.media.playPause()});
        this.mediaNext = button({iconName: 'media-skip-forward-symbolic', accessibleName: 'Next track',
            onClick: () => this.media.next()});
        controls.add_child(this.mediaPrevious);
        controls.add_child(this.mediaPlay);
        controls.add_child(this.mediaNext);
        controls.add_child(button({iconName: 'view-reveal-symbolic', accessibleName: 'Raise media player',
            onClick: () => this.media.raise()}));
        page.add_child(controls);
        const playerVolume = box(false, '', 8);
        playerVolume.add_child(label('Player volume'));
        this.playerVolume = slider(1, value => this.media.setVolume(value), 'Player volume');
        this.playerVolumeLabel = label('100%');
        playerVolume.add_child(this.playerVolume);
        playerVolume.add_child(this.playerVolumeLabel);
        page.add_child(playerVolume);
        const outputVolume = box(false, '', 8);
        outputVolume.add_child(label('System output'));
        this.outputVolume = slider(0, value => this.audio.setVolume(value), 'System output volume');
        this.outputMute = button({iconName: 'audio-volume-high-symbolic', accessibleName: 'Mute system output',
            onClick: () => this.audio.toggleMute()});
        outputVolume.add_child(this.outputVolume);
        outputVolume.add_child(this.outputMute);
        page.add_child(outputVolume);
        return page;
    }

    updateMedia() {
        if (this.dead || !this.mediaTitle) return;
        const state = this.media.snapshot();
        setText(this.mediaTitle, state.title);
        this.updateHome(state);
        this.updateSummary();
        setText(this.mediaArtist, state.artist || state.identity);
        setText(this.mediaAlbum, state.album);
        setText(this.mediaElapsed, formatTime(state.positionUs));
        setText(this.mediaDuration, formatTime(state.lengthUs));
        this.mediaSeek._notchSet(state.lengthUs ? state.positionUs / state.lengthUs : 0);
        this.mediaSeek.reactive = state.canSeek && state.lengthUs > 0;
        this.mediaSeek.can_focus = this.mediaSeek.reactive;
        this.mediaPrevious.reactive = state.canGoPrevious;
        this.mediaNext.reactive = state.canGoNext;
        this.mediaPlay.reactive = state.canControl && (state.canPlay || state.canPause);
        this.mediaPlay.child.get_last_child().icon_name = state.status === 'Playing' ?
            'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this.mediaPlayer.child.get_last_child().text = state.names.length > 1 ?
            `${state.identity}  ·  ${state.names.length} players ›` : state.identity;
        this.mediaPlayer.reactive = state.names.length > 1;
        this.playerVolume._notchSet(state.volume);
        this.playerVolume.reactive = state.canControl;
        setText(this.playerVolumeLabel, `${Math.round(state.volume * 100)}%`);
        const artKey = `${state.artUrl}|${this.settings.get_boolean('remote-art')}`;
        if (artKey !== this.artKey) {
            this.artKey = artKey;
            this.art.load(state.artUrl, gicon => {
                if (this.dead) return;
                this.mediaArt.gicon = gicon;
                this.mediaArt.icon_name = gicon ? null : 'audio-x-generic-symbolic';
                this.mediaArt.fallback_gicon = null;
                this.homeArt.gicon = gicon;
                this.homeArt.icon_name = gicon ? null : 'audio-x-generic-symbolic';
            });
        }
        this.updateAudio();
    }

    updateAudio() {
        if (this.dead || !this.outputVolume) return;
        const state = this.audio.snapshot();
        this.outputVolume._notchSet(state.volume);
        this.outputVolume.reactive = state.available;
        this.outputMute.reactive = state.available;
        this.outputMute.child.get_first_child().icon_name = state.muted || state.volume === 0 ?
            'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic';
    }

    buildSystem() {
        const page = box(true, '', 14);
        const cards = box(false, '', 10);
        this.stats = {};
        for (const [id, title, iconName] of [['cpu', 'Processor', 'utilities-system-monitor-symbolic'],
            ['ram', 'Memory', 'drive-harddisk-symbolic'],
            ['battery', 'Battery', 'battery-symbolic'],
            ['network', 'Network', 'network-wired-symbolic']]) {
            const card = box(true, 'notch-card', 6);
            card.x_expand = true;
            const heading = box(false, '', 6);
            heading.add_child(icon(iconName));
            heading.add_child(label(title));
            const value = label('—', 'notch-value');
            const detail = label('Waiting for sample');
            card.add_child(heading);
            card.add_child(value);
            card.add_child(detail);
            cards.add_child(card);
            this.stats[id] = {value, detail};
        }
        page.add_child(cards);
        page.add_child(label('QUICK ACTIONS', 'notch-muted'));
        this.actionsRow = box(false, '', 8);
        page.add_child(this.actionsRow);
        page.add_child(label('Sampling runs only while this page is visible. Network uses the default IPv4 interface.',
            'notch-muted'));
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
        this.actionsRow.destroy_all_children();
        this.actionButtons = [];
        this.homeActions?.destroy_all_children();
        for (const item of this.actions.items) {
            const widget = button({text: item.label, iconName: item.icon, style: 'notch-action',
                onClick: () => this.actions.toggle(item)});
            widget.toggle_mode = true;
            this.actionsRow.add_child(widget);
            this.actionButtons.push({item, widget});
            if (this.homeActions) {
                const compact = button({iconName: item.icon, style: 'notch-action', accessibleName: item.label,
                    onClick: () => this.actions.toggle(item)});
                compact.toggle_mode = true;
                this.homeActions.add_child(compact);
                this.actionButtons.push({item, widget: compact});
            }
        }
        if (!this.actions.items.length)
            this.actionsRow.add_child(label('Enable quick actions in Notch Settings.'));
        for (const {item, widget} of this.actionButtons) {
            const active = this.actions.snapshot(item);
            widget.checked = active;
            if (active) widget.add_style_class_name('notch-action-active');
            else widget.remove_style_class_name('notch-action-active');
        }
    }

    buildShelf() {
        const page = box(true, '', 8);
        const header = box(false, '', 8);
        header.add_child(label('Quick stash', 'notch-title', true));
        header.add_child(button({text: 'Add files', iconName: 'list-add-symbolic', onClick: () => this.shelf.choose()}));
        header.add_child(button({text: 'Clear', onClick: () => this.shelf.clear(), accessibleName: 'Clear shelf references'}));
        page.add_child(header);
        this.shelfStatus = label('Drop files near the notch, or add them here. Originals stay in place.');
        page.add_child(this.shelfStatus);
        this.shelfList = box(true, '', 6);
        this.shelfList.x_expand = true;
        const scroll = new St.ScrollView({style_class: 'notch-scroll', hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, y_expand: true});
        scroll.add_child(this.shelfList);
        page.add_child(scroll);
        page.add_child(label('Drop files when the GTK target appears', 'notch-drop'));
        return page;
    }

    updateShelf() {
        if (this.dead || !this.shelfList) return;
        this.shelfList.destroy_all_children();
        setText(this.shelfStatus, this.shelf.ready ?
            'Drop files near the notch, or add them here. Originals stay in place.' :
            'Helper is idle or offline. Shelf actions will start it; use notch-doctor if it stays offline.');
        if (!this.shelf.items.length) {
            this.shelfList.add_child(label('Your shelf is empty. Stash a few files for later.'));
            return;
        }
        for (const item of this.shelf.items) {
            const row = box(false, 'notch-row', 6);
            const open = button({text: item.name, iconName: 'text-x-generic-symbolic',
                onClick: () => this.shelf.open(item.uri), accessibleName: `Open ${item.name}`});
            open.x_expand = true;
            open.child.x_align = Clutter.ActorAlign.START;
            row.add_child(open);
            row.add_child(button({iconName: 'edit-copy-symbolic', accessibleName: `Copy URI of ${item.name}`,
                onClick: () => this.shelf.copy(item.uri)}));
            row.add_child(button({iconName: 'folder-open-symbolic', accessibleName: `Reveal ${item.name}`,
                onClick: () => this.shelf.reveal(item.uri)}));
            row.add_child(button({iconName: 'user-trash-symbolic', accessibleName: `Remove ${item.name} from shelf`,
                onClick: () => this.shelf.remove(item.uri)}));
            this.shelfList.add_child(row);
        }
    }

    buildClipboard() {
        const page = box(true, '', 8);
        const header = box(false, '', 8);
        this.clipboardStatus = label('Clipboard history is off', 'notch-title', true);
        header.add_child(this.clipboardStatus);
        header.add_child(button({text: 'Capture now', onClick: () => this.clipboard.capture()}));
        header.add_child(button({text: 'Clear history', onClick: () => this.clipboard.clear()}));
        page.add_child(header);
        page.add_child(label('RAM only. Cleared on lock/logout. Mixed-format and known password-manager clips are skipped.'));
        this.clipboardList = box(true, '', 6);
        this.clipboardList.x_expand = true;
        const scroll = new St.ScrollView({style_class: 'notch-scroll', hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, y_expand: true});
        scroll.add_child(this.clipboardList);
        page.add_child(scroll);
        return page;
    }

    updateClipboard() {
        if (this.dead || !this.clipboardList) return;
        const enabled = this.settings.get_boolean('clipboard-enabled');
        setText(this.clipboardStatus, enabled ? 'Clipboard history · on' : 'Clipboard history · manual only');
        this.clipboardList.destroy_all_children();
        if (!this.clipboard.history.items.length) {
            this.clipboardList.add_child(label(enabled ? 'Copy plain text to begin.' :
                'Enable automatic history in Settings, or capture the current text explicitly.'));
            return;
        }
        for (const item of this.clipboard.history.items) {
            const row = box(false, 'notch-row', 8);
            const preview = item.text.replace(/\s+/g, ' ').slice(0, 160);
            const copy = button({text: preview, iconName: 'edit-paste-symbolic',
                accessibleName: 'Restore this clipboard entry',
                onClick: () => {
                    if (this.clipboard.restore(item.id)) Main.notify('Notch', 'Selected text copied to the clipboard.');
                }});
            copy.x_expand = true;
            copy.child.x_align = Clutter.ActorAlign.START;
            row.add_child(copy);
            row.add_child(label(new Date(item.now).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})));
            this.clipboardList.add_child(row);
        }
    }

    showError(message) {
        if (this.dead) return;
        setText(this.statusLabel, message);
        if (message !== this.lastError) Main.notify('Notch', message);
        this.lastError = message;
    }

    state() {
        return JSON.stringify({version: '0.1.0', mode: this.mode, expanded: this.expanded, visible: this.allowed,
            media: this.media.snapshot().identity, clipboardCount: this.clipboard.history.items.length,
            shelfCount: this.shelf.items.length, notificationCount: this.notifications?.count ?? 0,
            activeNotification: !!this.notifications?.active});
    }

    destroy() {
        this.dead = true;
        for (const name of ['hoverTimer', 'closeTimer', 'hideTimer', 'mediaTimer', 'peekTimer']) this.clearTimer(name);
        this.stopTimeline();
        if (this.visualTimer) GLib.source_remove(this.visualTimer);
        this.visualTimer = 0;
        this.injections?.clear();
        this.content?.remove_all_transitions();
        this.closedLayer?.remove_all_transitions();
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
        this.audio?.destroy();
        this.diagnostics?.destroy();
        this.clipboard?.destroy();
        this.shelf?.destroy();
        this.art?.destroy();
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
        this.helperWindow = null;
    }
}
