import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {BluetoothBattery} from './bluetooth.js';
import {Countdown, calendarMonth, countdownText, osdKind, FEATURES} from './features.js';
import {box, button, label, setText, wrapLabel} from './widgets.js';

/** Optional controllers own their sources/hooks; disabling a feature tears them down. */
export class Extras {
    constructor(view) {
        this.view = view;
        this.settings = view.settings;
        this.countdown = new Countdown(() => GLib.get_monotonic_time() / 1000);
        this.timerMode = 'timer';
        this.osdInjections = new InjectionManager();
    }

    buildHome(page) {
        this.calendar = box(true, 'notch-calendar', 2);
        this.calendar.visible = false;
        page.add_child(this.calendar);
        this.timerBox = box(true, 'notch-timer', 5);
        const presets = box(false, '', 6);
        presets.x_align = Clutter.ActorAlign.CENTER;
        for (const [mode, title] of [['timer', 'Timer'], ['focus', 'Focus'], ['break', 'Break']])
            presets.add_child(button({text: title, style: 'notch-small-button', onClick: () => this.resetTimer(mode)}));
        this.timerBox.add_child(presets);
        this.timerLabel = label('', 'notch-timer-value');
        this.timerBox.add_child(this.timerLabel);
        const controls = box(false, '', 6);
        controls.x_align = Clutter.ActorAlign.CENTER;
        this.timerStart = button({text: 'Start', style: 'notch-small-button', onClick: () => {
            if (this.countdown.done) {
                const next = this.timerMode === 'focus' ? 'break' : this.timerMode === 'break' ? 'focus' : 'timer';
                this.resetTimer(next);
            }
            if (this.countdown.running) this.countdown.pause();
            else this.countdown.start();
            this.syncTimer();
        }});
        controls.add_child(this.timerStart);
        controls.add_child(button({text: 'Reset', style: 'notch-small-button', onClick: () => this.resetTimer(this.timerMode)}));
        this.timerBox.add_child(controls);
        this.timerBox.visible = false;
        page.add_child(this.timerBox);
    }

    buildSystem(page) {
        this.bluetoothList = box(true, 'notch-bluetooth', 4);
        this.bluetoothList.visible = false;
        page.add_child(this.bluetoothList);
    }

    wrapPage(id, page) {
        const scroll = new St.ScrollView({hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER, overlay_scrollbars: true, x_expand: true});
        scroll.add_child(page);
        this.scrolls ??= {};
        this.scrolls[id] = scroll;
        return scroll;
    }

    adapt(layout) {
        for (const [id, scroll] of Object.entries(this.scrolls ?? {})) {
            const enabled = id === 'home' ? this.settings.get_boolean('timer-enabled') || this.calendar.visible :
                id === 'system' ? this.settings.get_boolean('bluetooth-battery') :
                    this.settings.get_boolean('media-art') || this.settings.get_boolean('music-polish');
            scroll.vscrollbar_policy = enabled ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
            scroll.y_expand = enabled;
            scroll.y_align = enabled ? Clutter.ActorAlign.FILL : Clutter.ActorAlign.CENTER;
            scroll.set_size(layout.width * layout.cssScale, enabled ? layout.pageHeight * layout.cssScale : -1);
        }
        const cellWidth = Math.max(16, Math.floor((layout.width - 32) * layout.cssScale / 7));
        const boundedWidth = Math.min(40 * layout.cssScale, cellWidth);
        if (boundedWidth !== this.cellWidth) {
            this.cellWidth = boundedWidth;
            this.renderCalendar();
        }
    }

    configure(key = '') {
        if (this.dead) return;
        const enabled = this.settings.get_boolean('timer-enabled');
        this.timerBox.visible = enabled;
        if (!key || key === 'timer-enabled' || ['timer-minutes', 'focus-minutes', 'break-minutes'].includes(key))
            this.resetTimer(this.timerMode);
        if (!enabled) this.stopTick();
        if (!this.settings.get_boolean('calendar-enabled')) this.calendar.visible = false;
        this.view.homeDateButton.reactive = this.settings.get_boolean('calendar-enabled');
        this.view.homeDateButton.can_focus = this.view.homeDateButton.reactive;
        if (!key || key === 'volume-indicator' || key === 'brightness-indicator') this.configureOsd();
        if (this.settings.get_boolean('bluetooth-battery')) {
            if (!this.bluetooth) this.bluetooth = new BluetoothBattery(devices => this.updateBluetooth(devices),
                device => this.view.showCue(`${device.name.slice(0, 16)}${device.percent === null ? ' connected' : ` · ${device.percent}%`}`, 'bluetooth-symbolic', 'bluetooth'));
            this.bluetoothList.visible = true;
            this.updateBluetooth(this.bluetooth?.devices ?? []);
        } else {
            this.bluetooth?.destroy();
            this.bluetooth = null;
            this.bluetoothList.visible = false;
            this.bluetoothList.destroy_all_children();
        }
        const cueFeature = {'volume-indicator': 'volume', 'brightness-indicator': 'brightness',
            'bluetooth-battery': 'bluetooth', 'timer-enabled': 'timer'};
        if (cueFeature[key] && cueFeature[key] === this.view.cueKind) this.view.hideCue();
        this.refreshGeometry();
    }

    resetTimer(mode) {
        this.stopTick();
        this.timerMode = mode;
        if (this.view.cueKind === 'timer') this.view.hideCue();
        this.countdown.reset(this.settings.get_int(`${mode}-minutes`) * 60);
        this.syncTimer();
    }

    stopTick() {
        if (this.tickSource) GLib.source_remove(this.tickSource);
        this.tickSource = 0;
    }

    syncTimer() {
        const enabled = this.settings.get_boolean('timer-enabled');
        if (enabled && this.countdown.running && !this.tickSource) {
            this.tickSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                if (this.countdown.tick()) {
                    this.tickSource = 0;
                    this.renderTimer();
                    this.view.showCue(`${this.timerMode === 'focus' ? 'Focus' : this.timerMode === 'break' ? 'Break' : 'Timer'} complete`, 'alarm-symbolic', 'timer');
                    return GLib.SOURCE_REMOVE;
                }
                this.renderTimer();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!enabled || !this.countdown.running) this.stopTick();
        this.renderTimer();
    }

    renderTimer() {
        const title = this.timerMode === 'focus' ? 'Focus' : this.timerMode === 'break' ? 'Break' : 'Timer';
        setText(this.timerLabel, `${title} · ${countdownText(this.countdown.seconds())}${this.countdown.done ? ' · Done' : ''}`);
        setText(this.timerStart._notchLabel, this.countdown.done ? (this.timerMode === 'timer' ? 'Restart' : 'Next session') : this.countdown.running ? 'Pause' : 'Start');
        this.view.updateClock();
    }

    summary() {
        if (!this.settings.get_boolean('timer-enabled')) return '';
        if (this.countdown.done) return 'Timer done';
        if (this.countdown.running || this.countdown.remaining < this.countdown.duration)
            return `${this.countdown.running ? '' : 'Ⅱ '}${countdownText(this.countdown.seconds())}`;
        return '';
    }

    toggleCalendar() {
        if (!this.settings.get_boolean('calendar-enabled')) return;
        this.calendar.visible = !this.calendar.visible;
        if (this.calendar.visible) {
            const now = new Date();
            this.calendarDate = new Date(now.getFullYear(), now.getMonth(), 1, 12);
            this.renderCalendar();
        }
        this.refreshGeometry();
    }

    renderCalendar() {
        if (!this.calendar.visible) return;
        this.calendar.destroy_all_children();
        const data = calendarMonth(this.calendarDate.getFullYear(), this.calendarDate.getMonth());
        const header = box(false, '', 6);
        header.x_align = Clutter.ActorAlign.FILL;
        for (const [delta, text] of [[-1, '‹'], [0, data.title], [1, '›']]) {
            const navigation = button({text, wrapText: delta === 0, style: 'notch-small-button',
                accessibleName: delta ? (delta < 0 ? 'Previous month' : 'Next month') : 'Go to current month',
                onClick: () => {
                    const now = new Date();
                    this.calendarDate = delta ? new Date(data.year, data.month + delta, 1, 12) : new Date(now.getFullYear(), now.getMonth(), 1, 12);
                    this.renderCalendar();
                }});
            navigation.x_expand = delta === 0;
            header.add_child(navigation);
        }
        this.calendar.add_child(header);
        const week = box(false, '', 0);
        week.x_align = Clutter.ActorAlign.CENTER;
        // Derive localized weekday names from a known Monday.
        for (let day = 0; day < 7; day++) {
            const heading = label(new Date(2024, 0, 1 + day, 12).toLocaleDateString([], {weekday: 'narrow'}), 'notch-calendar-weekday');
            heading.set_width(this.cellWidth ?? 30);
            week.add_child(heading);
        }
        this.calendar.add_child(week);
        for (let row = 0; row < 6; row++) {
            const line = box(false, '', 0);
            line.x_align = Clutter.ActorAlign.CENTER;
            for (const cell of data.cells.slice(row * 7, row * 7 + 7)) {
                const day = label(cell.day ? String(cell.day) : ' ', cell.today ? 'notch-calendar-today' : 'notch-calendar-day');
                day.set_width(this.cellWidth ?? 30);
                day.accessible_name = cell.day ? `${cell.day} ${data.title}${cell.today ? ', today' : ''}` : '';
                line.add_child(day);
            }
            this.calendar.add_child(line);
        }
    }

    updateBluetooth(devices) {
        if (this.dead || !this.bluetoothList) return;
        this.bluetoothList.destroy_all_children();
        const supported = devices.filter(device => device.percent !== null);
        for (const device of supported) {
            const row = wrapLabel(`${device.name} · ${device.percent}%`, 'notch-stat-detail');
            this.bluetoothList.add_child(row);
        }
        if (!supported.length) this.bluetoothList.add_child(wrapLabel('Bluetooth · No connected device reporting battery', 'notch-muted'));
    }

    configureOsd() {
        this.osdInjections.clear();
        if (!this.settings.get_boolean('volume-indicator') && !this.settings.get_boolean('brightness-indicator')) return;
        // _showOsdWindow is the per-monitor dispatch used in GNOME 46–50,
        // including 50's newer show/showOne/showAll public entry points.
        const extras = this;
        if (typeof Main.osdWindowManager?._showOsdWindow !== 'function') return;
        this.osdInjections.overrideMethod(Main.osdWindowManager, '_showOsdWindow', original => function (monitor, gicon, text, level, maxLevel) {
            const kind = osdKind(gicon);
            if (kind && extras.settings.get_boolean(`${kind}-indicator`) &&
                monitor === extras.view.monitor().index && Number.isFinite(level) &&
                extras.view.showLevel(kind, gicon, level, maxLevel)) {
                this._osdWindows?.[monitor]?.cancel();
                return;
            }
            original.call(this, monitor, gicon, text, level, maxLevel);
        });
    }

    refreshGeometry() {
        this.view.options = this.view.readOptions();
        this.view.relayout('resize');
    }

    isFeatureKey(key) {
        return FEATURES.some(([name]) => name === key) || ['timer-minutes', 'focus-minutes', 'break-minutes', 'peek-blocked-apps'].includes(key);
    }

    destroy() {
        this.dead = true;
        this.stopTick();
        this.osdInjections.clear();
        this.bluetooth?.destroy();
    }
}
