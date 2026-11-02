import Gio from 'gi://Gio';
import {bluetoothDevices} from './features.js';

/** Event-driven BlueZ ObjectManager. Created only while the feature is enabled. */
export class BluetoothBattery {
    constructor(onChange, onConnect) {
        this.onChange = onChange;
        this.onConnect = onConnect;
        this.devices = [];
        this.cancellable = new Gio.Cancellable();
        Gio.DBusObjectManagerClient.new_for_bus(Gio.BusType.SYSTEM,
            Gio.DBusObjectManagerClientFlags.DO_NOT_AUTO_START, 'org.bluez', '/',
            null, this.cancellable, (_source, result) => {
                try {
                    const manager = Gio.DBusObjectManagerClient.new_for_bus_finish(result);
                    if (this.dead) return;
                    this.manager = manager;
                    manager.connectObject('object-added', () => this.refresh(),
                        'object-removed', () => this.refresh(),
                        'interface-added', () => this.refresh(),
                        'interface-removed', () => this.refresh(),
                        'interface-proxy-properties-changed', () => this.refresh(), this);
                    this.refresh(true);
                } catch {
                    if (!this.dead) this.onChange([]);
                }
            });
    }

    refresh(initial = false) {
        if (this.dead) return;
        const previous = new Set(this.devices.map(device => device.path));
        this.devices = bluetoothDevices(this.manager.get_objects());
        this.onChange(this.devices);
        if (!initial) {
            for (const device of this.devices)
                if (!previous.has(device.path)) this.onConnect(device);
        }
    }

    destroy() {
        this.dead = true;
        this.cancellable.cancel();
        this.manager?.disconnectObject(this);
        this.manager = null;
        this.devices = [];
    }
}
