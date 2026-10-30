import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {cpuSample, memorySample, networkSample, defaultRouteInterface} from './model.js';
import {newProxy, errorMessage} from './dbus.js';

function read(path) {
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(contents) : '';
    } catch { return ''; }
}

/** No worker process and no sampling while the System page is hidden. */
export class Diagnostics {
    constructor(directory, onUpdate) {
        this.directory = directory;
        this.onUpdate = onUpdate;
        this.cancellable = new Gio.Cancellable();
        this.dead = false;
        this.timer = 0;
        this.previousCpu = null;
        this.previousNetwork = null;
        this.previousTime = 0;
        this.battery = {available: false, percent: null, state: 0, watts: null};
    }

    async start() {
        try {
            this.proxy = await newProxy(this.directory, 'org.freedesktop.UPower.Device.xml',
                'org.freedesktop.UPower', '/org/freedesktop/UPower/devices/DisplayDevice', this.cancellable);
            if (this.dead) return;
            this.proxy.connectObject('g-properties-changed', () => this.updateBattery(), this);
            this.updateBattery();
        } catch (e) {
            if (!this.dead) console.debug(`Notch: battery unavailable: ${errorMessage(e)}`);
        }
    }

    updateBattery() {
        const p = this.proxy;
        this.battery = {available: !!p && p.Type === 2 && !!p.IsPresent,
            percent: p?.Percentage ?? null, state: p?.State ?? 0, watts: p?.EnergyRate ?? null};
        this.onUpdate();
    }

    setActive(active) {
        if (active && !this.timer) {
            this.previousCpu = null;
            this.previousNetwork = null;
            this.sample();
            this.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this.sample();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!active && this.timer) {
            GLib.source_remove(this.timer);
            this.timer = 0;
        }
    }

    sample() {
        const now = GLib.get_monotonic_time();
        const elapsed = this.previousTime ? (now - this.previousTime) / 1e6 : 1;
        const cpu = cpuSample(read('/proc/stat'), this.previousCpu);
        const memory = memorySample(read('/proc/meminfo'));
        const route = defaultRouteInterface(read('/proc/net/route'));
        const network = networkSample(read('/proc/net/dev'), this.previousNetwork, elapsed, route);
        this.previousCpu = cpu.raw ?? this.previousCpu;
        this.previousNetwork = network.raw ?? this.previousNetwork;
        this.previousTime = now;
        this.values = {cpu, memory, network, battery: this.battery};
        this.onUpdate();
    }

    destroy() {
        this.dead = true;
        this.setActive(false);
        this.cancellable.cancel();
        this.proxy?.disconnectObject(this);
        this.proxy = null;
    }
}
