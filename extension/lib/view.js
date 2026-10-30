import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {notchGeometry, containsPoint} from './geometry.js';
import {formatBytes, formatTime} from './model.js';
import {box, label, icon, button, slider, setText} from './widgets.js';
import {MediaController} from './media.js';
import {AudioController} from './audio.js';
import {Diagnostics} from './diagnostics.js';
import {QuickActions} from './actions.js';
import {ClipboardController} from './clipboard.js';
import {ShelfController} from './shelf.js';
import {ArtLoader} from './art.js';


const TABS = [
    ['media', 'Media', 'audio-x-generic-symbolic'],
    ['system', 'System', 'utilities-system-monitor-symbolic'],
    ['shelf', 'Shelf', 'folder-symbolic'],
    ['clipboard', 'Clipboard', 'edit-paste-symbolic'],
];

export class NotchView {
    constructor(extension) {
        this.extension = extension;
        this.settings = extension.settings;
        this.directory = extension.dir;
        this.dead = false;
        try {
            this._initialize();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _initialize() {
        this.expanded = false;
        this.tab = 'media';
        this.dead = false;
        this.allowed = true;
        this.externalDrag = false;
        this.hoverTimer = 0;
        this.closeTimer = 0;
        this.hideTimer = 0;
        this.animationToken = 0;
        this.artKey = null;
        this.options = this.readOptions();
        this.media = new MediaController(this.directory, () => this.updateMedia(), e => this.showError(e));
        this.audio = new AudioController(() => this.updateAudio());
        this.diagnostics = new Diagnostics(this.directory, () => this.updateSystem());
        this.clipboard = new ClipboardController(this.settings.get_int('clipboard-limit'),
            () => this.updateClipboard());
        this.shelf = new ShelfController(this.directory, () => this.updateShelf(), e => this.showError(e));
        this.art = new ArtLoader(this.settings.get_boolean('remote-art'));
        this.actions = new QuickActions(this.settings, () => this.updateActions());
        this.build();
        this.connectEnvironment();
        this.media.start();
        this.diagnostics.start();
        this.shelf.start();
        this.clipboard.configure(this.settings.get_boolean('clipboard-enabled'),
            this.settings.get_int('clipboard-limit'));
        this.settings.connectObject('changed', (_settings, key) => this.settingChanged(key), this);
        this.updateMedia();
        this.updateSystem();
        this.updateShelf();
        this.updateClipboard();
        this.syncVisibility();
        this.updateReserve();
    }

    readOptions() {
        return {collapsedWidth: this.settings.get_int('collapsed-width'),
            collapsedHeight: this.settings.get_int('collapsed-height'),
            expandedWidth: this.settings.get_int('expanded-width'),
            expandedHeight: this.settings.get_int('expanded-height'),
            placement: this.settings.get_string('placement'),
            floatingMargin: this.settings.get_int('floating-margin'),
            horizontalOffset: this.settings.get_int('horizontal-offset'),
            panelHeight: Main.layoutManager.panelBox.height || 32};
    }

    monitor() {
        const index = this.settings.get_int('monitor-index');
        return Main.layoutManager.monitors[index] ?? Main.layoutManager.primaryMonitor ??
            Main.layoutManager.monitors[0] ?? {index: 0, x: 0, y: 0, width: 1920, height: 1080};
    }

    geometry(expanded = this.expanded) { return notchGeometry(this.monitor(), this.options, expanded); }

    build() {
        const collapsed = this.geometry(false);
        this.actor = new St.Widget({style_class: 'notch-shell', reactive: true,
            track_hover: true, clip_to_allocation: true, ...collapsed,
            layout_manager: new Clutter.FixedLayout()});
        this.pill = button({text: 'Notch', iconName: 'audio-x-generic-symbolic', style: 'notch-pill',
            accessibleName: 'Expand Notch', onClick: () => this.toggle()});
        this.pill.set_size(collapsed.width, collapsed.height);
        this.actor.add_child(this.pill);
        this.content = box(true, 'notch-content', 10);
        this.content.opacity = 0;
        this.content.visible = false;
        this.actor.add_child(this.content);
        const header = box(false, 'notch-tabs', 6);
        this.tabs = new Map();
        for (const [id, title, iconName] of TABS) {
            const tab = button({text: title, iconName, style: 'notch-tab',
                onClick: () => this.setTab(id)});
            tab.toggle_mode = true;
            this.tabs.set(id, tab);
            header.add_child(tab);
        }
        header.add_child(new St.Widget({x_expand: true}));
        header.add_child(button({iconName: 'emblem-system-symbolic', accessibleName: 'Notch settings',
            onClick: () => {
                try { this.extension.openPreferences(); } catch (e) { this.showError(e.message); }
            }}));
        header.add_child(button({iconName: 'window-close-symbolic', accessibleName: 'Collapse Notch',
            onClick: () => this.setExpanded(false)}));
        this.content.add_child(header);
        this.pages = {media: this.buildMedia(), system: this.buildSystem(),
            shelf: this.buildShelf(), clipboard: this.buildClipboard()};
        for (const page of Object.values(this.pages)) {
            page.x_expand = true;
            page.y_expand = true;
            this.content.add_child(page);
        }
        this.statusLabel = label('', 'notch-muted');
        this.statusLabel.clutter_text.line_wrap = true;
        this.statusLabel.clutter_text.ellipsize = 0;
        this.content.add_child(this.statusLabel);
        Main.layoutManager.addChrome(this.actor, {trackFullscreen: false, affectsStruts: false});
        this.actor.connectObject('notify::allocation', () => this.layoutContent(), this);
        this.actor.connect('enter-event', () => this.pointerEntered());
        this.actor.connect('leave-event', () => this.pointerLeft());
        this.applyStyle();
        this.setTab(this.tab);
        this.layoutContent();
    }

    layoutContent() {
        const expanded = this.geometry(true);
        this.content.set_size(this.actor.width - 2, expanded.height - this.options.collapsedHeight - 2);
        this.content.set_position(1, this.options.collapsedHeight);
        this.pill.set_size(this.actor.width, Math.min(this.actor.height, this.options.collapsedHeight));
    }

    applyStyle() {
        const radius = this.settings.get_int('corner-radius');
        const attached = this.options.placement === 'panel';
        this.actor.set_style(`border-radius: ${attached ? 0 : radius}px ${attached ? 0 : radius}px ${radius}px ${radius}px;`);
        this.actor.opacity = Math.round(this.settings.get_double('opacity') * 255);
    }

    connectEnvironment() {
        Main.layoutManager.connectObject('monitors-changed', () => this.relayout(), this);
        Main.overview.connectObject('showing', () => this.syncVisibility(),
            'hiding', () => this.syncVisibility(), this);
        Main.sessionMode.connectObject('updated', () => this.syncVisibility(), this);
        global.display.connectObject('in-fullscreen-changed', () => this.syncVisibility(), this);
        this.stagePress = global.stage.connect('captured-event', (_stage, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS && this.expanded) {
                const [x, y] = event.get_coords();
                const [ax, ay] = this.actor.get_transformed_position();
                if (!containsPoint({x: ax, y: ay, width: this.actor.width, height: this.actor.height}, x, y))
                    this.setExpanded(false);
            } else if (event.type() === Clutter.EventType.KEY_PRESS && this.expanded &&
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
        // Session lock is also represented by sessionMode; this catches shells without the proxy.
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
            this.tab = 'shelf';
            this.shelf.showDropTarget(target);
            this.placeHelper();
        } else { this.endDrag(); }
    }

    dropRectangle() {
        const expanded = this.geometry(true);
        return {x: expanded.x + 16, y: expanded.y + this.options.collapsedHeight + 8,
            width: Math.max(160, expanded.width - 32),
            height: Math.max(100, expanded.height - this.options.collapsedHeight - 24)};
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
        if (key.startsWith('clipboard-')) {
            this.clipboard.configure(this.settings.get_boolean('clipboard-enabled'),
                this.settings.get_int('clipboard-limit'));
        }
        if (key.startsWith('show-')) {
            this.actions.destroy();
            this.actions = new QuickActions(this.settings, () => this.updateActions());
            this.updateActions();
        }
        if (key === 'remote-art') {
            this.art.setAllowRemote(this.settings.get_boolean('remote-art'));
            this.artKey = null;
            this.updateMedia();
        }
        this.options = this.readOptions();
        this.applyStyle();
        this.relayout();
        this.syncVisibility();
        if (key === 'reserve-space' || key === 'placement') this.updateReserve();
    }

    relayout() {
        this.options = this.readOptions();
        const rect = this.geometry();
        this.actor.remove_all_transitions();
        this.actor.set_position(rect.x, rect.y);
        this.actor.set_size(rect.width, rect.height);
        this.layoutContent();
        if (this.reserve) this.updateReserve();
        if (this.shelf.dropVisible) {
            this.shelf.hideDropTarget();
            this.shelf.showDropTarget(this.dropRectangle());
            this.placeHelper();
        }
    }

    updateReserve() {
        if (this.reserve) {
            Main.layoutManager.removeChrome(this.reserve);
            this.reserve.destroy();
            this.reserve = null;
        }
        if (!this.settings.get_boolean('reserve-space') || this.options.placement === 'floating') return;
        const rect = this.geometry(false);
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
        this.diagnostics.setActive(this.allowed && this.expanded && this.tab === 'system');
        if (!this.allowed) {
            this.endDrag();
            this.setExpanded(false);
        }
    }

    clearTimer(name) {
        if (this[name]) GLib.source_remove(this[name]);
        this[name] = 0;
    }

    pointerEntered() {
        this.clearTimer('closeTimer');
        if (!this.settings.get_boolean('open-on-hover') || this.expanded || this.externalDrag) return;
        this.clearTimer('hoverTimer');
        this.hoverTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this.settings.get_int('hover-delay-ms'), () => {
                this.hoverTimer = 0;
                if (this.allowed && this.actor.hover) this.setExpanded(true);
                return GLib.SOURCE_REMOVE;
            });
    }

    pointerLeft() {
        this.clearTimer('hoverTimer');
        this.clearTimer('closeTimer');
        if (!this.expanded) return;
        this.closeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
            this.closeTimer = 0;
            if (global.stage.get_grab_actor() || this.externalDrag) return GLib.SOURCE_CONTINUE;
            const [x, y] = global.get_pointer();
            const [ax, ay] = this.actor.get_transformed_position();
            if (!containsPoint({x: ax, y: ay, width: this.actor.width, height: this.actor.height}, x, y))
                this.setExpanded(false);
            return GLib.SOURCE_REMOVE;
        });
    }

    toggle() { this.setExpanded(!this.expanded); }

    setExpanded(expanded) {
        if (this.dead || (expanded && (!this.allowed || this.externalDrag))) return;
        this.expanded = expanded;
        this.clearTimer('hoverTimer');
        this.clearTimer('hideTimer');
        const rect = this.geometry(expanded);
        const token = ++this.animationToken;
        this.actor.remove_all_transitions();
        this.pill.remove_all_transitions();
        this.content.remove_all_transitions();
        this.content.visible = expanded;
        const duration = this.settings.get_boolean('animations') && St.Settings.get().enable_animations ? 220 : 0;
        const properties = {...rect, duration, mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => {
                if (token !== this.animationToken || this.dead) return;
                this.content.visible = this.expanded;
                this.pill.visible = !this.expanded;
            }};
        if (duration === 0) {
            this.actor.set_position(rect.x, rect.y);
            this.actor.set_size(rect.width, rect.height);
            this.content.opacity = expanded ? 255 : 0;
            this.pill.opacity = expanded ? 0 : 255;
            this.pill.visible = !expanded;
        } else {
            if (expanded) this.pill.visible = false;
            this.actor.ease(properties);
            this.pill.ease({opacity: expanded ? 0 : 255, duration});
            this.content.ease({opacity: expanded ? 255 : 0, duration});
        }
        this.layoutContent();
        this.setTab(this.tab);
        if (expanded && this.settings.get_int('auto-hide-ms') > 0) {
            this.hideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                this.settings.get_int('auto-hide-ms'), () => {
                    this.hideTimer = 0;
                    if (global.stage.get_grab_actor() || this.actor.hover || this.externalDrag)
                        return GLib.SOURCE_CONTINUE;
                    this.setExpanded(false);
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    setTab(tab) {
        this.tab = tab;
        for (const [id, widget] of this.tabs) {
            widget.checked = id === tab;
            this.pages[id].visible = id === tab;
        }
        this.diagnostics.setActive(this.allowed && this.expanded && tab === 'system');
        this.positionTimer();
        if (tab === 'shelf') {
            if (this.shelf.ready) this.shelf.refresh();
            else this.shelf.start();
        }
        if (tab === 'media') this.updateMedia();
    }

    positionTimer() {
        const active = this.allowed && this.expanded && this.tab === 'media';
        if (active && !this.mediaTimer) {
            this.mediaTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this.media.refreshPosition();
                this.updateMedia();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!active && this.mediaTimer) {
            GLib.source_remove(this.mediaTimer);
            this.mediaTimer = 0;
        }
    }

    buildMedia() {
        const page = box(true, '', 10);
        const row = box(false, '', 14);
        this.mediaArt = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 56,
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
        setText(this.pill.child.get_last_child(), state.names.length ? state.title : 'Notch');
        this.pill.child.get_first_child().icon_name = state.status === 'Playing' ?
            'audio-speakers-symbolic' : 'audio-x-generic-symbolic';
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
        for (const item of this.actions.items) {
            const widget = button({text: item.label, iconName: item.icon, style: 'notch-action',
                onClick: () => this.actions.toggle(item)});
            widget.toggle_mode = true;
            this.actionsRow.add_child(widget);
            this.actionButtons.push({item, widget});
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
        header.add_child(label('Quick stash · references only', 'notch-title', true));
        header.add_child(button({text: 'Add files', iconName: 'list-add-symbolic', onClick: () => this.shelf.choose()}));
        header.add_child(button({text: 'Clear', onClick: () => this.shelf.clear(), accessibleName: 'Clear shelf references'}));
        page.add_child(header);
        this.shelfStatus = label('Drag files near the notch, or use Add files. Originals are never moved.');
        page.add_child(this.shelfStatus);
        this.shelfList = box(true, '', 6);
        this.shelfList.x_expand = true;
        const scroll = new St.ScrollView({style_class: 'notch-scroll', hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, y_expand: true});
        scroll.add_child(this.shelfList);
        page.add_child(scroll);
        page.add_child(label('Drop files here when the green GTK target appears', 'notch-drop'));
        return page;
    }

    updateShelf() {
        if (this.dead || !this.shelfList) return;
        this.shelfList.destroy_all_children();
        setText(this.shelfStatus, this.shelf.ready ?
            'Drag files near the notch, or use Add files. Originals are never moved.' :
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
        return JSON.stringify({version: '0.1.0', expanded: this.expanded, visible: this.allowed,
            media: this.media.snapshot().identity, clipboardCount: this.clipboard.history.items.length,
            shelfCount: this.shelf.items.length});
    }

    destroy() {
        this.dead = true;
        this.animationToken++;
        for (const name of ['hoverTimer', 'closeTimer', 'hideTimer', 'mediaTimer']) this.clearTimer(name);
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
