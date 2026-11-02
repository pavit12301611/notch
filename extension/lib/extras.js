import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {BluetoothBattery} from './bluetooth.js';
import {osdKind, FEATURES} from './features.js';
import {wrapLabel, box} from './widgets.js';

/** Optional controllers own their sources/hooks; disabling a feature tears them down. */
export class Extras {
    constructor(view) {
        this.view = view;
        this.settings = view.settings;
        this.osdInjections = new InjectionManager();
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
            const enabled = id === 'calendar' ? this.settings.get_boolean('calendar-enabled') :
                id === 'system' ? this.settings.get_boolean('bluetooth-battery') :
                    id === 'media' && (this.settings.get_boolean('media-art') || this.settings.get_boolean('music-polish'));
            scroll.vscrollbar_policy = enabled ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
            scroll.y_expand = enabled;
            scroll.y_align = enabled ? Clutter.ActorAlign.FILL : Clutter.ActorAlign.CENTER;
            scroll.set_size(layout.width * layout.cssScale, enabled ? layout.pageHeight * layout.cssScale : -1);
        }
    }

    configure(key = '') {
        if (this.dead) return;
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
            'bluetooth-battery': 'bluetooth'};
        if (cueFeature[key] && cueFeature[key] === this.view.cueKind) this.view.hideCue();
        this.refreshGeometry();
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
        return FEATURES.some(([name]) => name === key) || key === 'peek-blocked-apps';
    }

    destroy() {
        this.dead = true;
        this.osdInjections.clear();
        this.bluetooth?.destroy();
    }
}
