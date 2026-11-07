import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function readPath(root, path) {
    let value = root;
    for (const part of path) value = value?.[part];
    return value;
}

function numberFrom(root, paths) {
    for (const path of paths) {
        const value = readPath(root, path);
        if (value === null || value === undefined) continue;
        const number = Number(value);
        if (Number.isFinite(number) && number >= 0 && number <= 1) return number;
    }
    return null;
}

/** Watches GNOME's existing quick-settings controls and BlueZ without owning any UI. */
export class SystemEvents {
    constructor(onEvent) {
        this.onEvent = onEvent;
        this.dead = false;
        this.timer = 0;
        this.previous = {volume: null, brightness: null};
        this.bluetoothWatch = 0;
    }

    start() {
        this.bluetoothWatch = Gio.DBus.session.signal_subscribe('org.bluez',
            'org.freedesktop.DBus.Properties', 'PropertiesChanged', null, 'org.bluez.Device1',
            Gio.DBusSignalFlags.NONE, (_connection, _sender, path, _iface, _signal, params) => {
                if (this.dead) return;
                try {
                    const [iface, changed] = params.deepUnpack();
                    if (iface !== 'org.bluez.Device1') return;
                    const connectedValue = changed.Connected;
                    if (connectedValue === undefined) return;
                    const connected = typeof connectedValue?.deepUnpack === 'function' ?
                        connectedValue.deepUnpack() : connectedValue;
                    const aliasValue = changed.Alias;
                    const alias = typeof aliasValue?.deepUnpack === 'function' ? aliasValue.deepUnpack() : aliasValue;
                    const device = typeof alias === 'string' && alias.trim() ? alias.trim() : 'Bluetooth device';
                    this.onEvent({type: 'device', connected: !!connected, device, path});
                } catch (error) {
                    console.debug(`Notch: Bluetooth event ignored: ${error.message ?? error}`);
                }
            });
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
            this.sampleQuickSettings();
            return this.dead ? GLib.SOURCE_REMOVE : GLib.SOURCE_CONTINUE;
        });
        this.sampleQuickSettings();
    }

    sampleQuickSettings() {
        if (this.dead) return;
        try {
            const quickSettings = Main.panel?.statusArea?.quickSettings;
            const volume = numberFrom(quickSettings, [
                ['_volume', '_output', '_slider', 'value'],
                ['_volume', '_output', '_volume'],
                ['_volume', '_output', 'volume'],
                ['_volume', '_slider', 'value'],
            ]);
            const brightness = numberFrom(quickSettings, [
                ['_brightness', '_slider', 'value'],
                ['_brightness', 'slider', 'value'],
            ]);
            this.detectLevel('volume', volume);
            this.detectLevel('brightness', brightness);
        } catch { /* Shell quick-settings internals vary across GNOME releases. */ }
    }

    detectLevel(type, value) {
        if (value === null) return;
        const previous = this.previous[type];
        this.previous[type] = value;
        // Seed on first observation; don't show an OSD just because the extension loaded.
        if (previous === null || Math.abs(value - previous) < 0.005) return;
        this.onEvent({type, value, direction: value > previous ? 'up' : 'down'});
    }

    destroy() {
        this.dead = true;
        if (this.timer) GLib.source_remove(this.timer);
        this.timer = 0;
        if (this.bluetoothWatch) Gio.DBus.session.signal_unsubscribe(this.bluetoothWatch);
        this.bluetoothWatch = 0;
    }
}
