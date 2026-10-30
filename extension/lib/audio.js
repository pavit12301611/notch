import Gvc from 'gi://Gvc';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

/** Reuse Shell's mixer connection; never open/close a second PulseAudio client. */
export class AudioController {
    constructor(onChange) {
        this.onChange = onChange;
        this.control = Volume.getMixerControl();
        this.sink = null;
        this.control.connectObject('state-changed', () => this.syncSink(),
            'default-sink-changed', () => this.syncSink(),
            'output-added', () => this.syncSink(),
            'output-removed', () => this.syncSink(), this);
        this.syncSink();
    }

    syncSink() {
        this.sink?.disconnectObject(this);
        this.sink = this.control.get_default_sink();
        this.sink?.connectObject('notify::volume', () => this.onChange(),
            'notify::is-muted', () => this.onChange(), this);
        this.onChange();
    }

    snapshot() {
        const maximum = this.control.get_vol_max_norm();
        return {available: !!this.sink && this.control.get_state() === Gvc.MixerControlState.READY,
            volume: this.sink && maximum > 0 ? this.sink.volume / maximum : 0,
            muted: !!this.sink?.is_muted};
    }

    setVolume(fraction) {
        if (!this.sink || this.snapshot().available === false) return;
        this.sink.volume = Math.max(0, Math.min(1, fraction)) * this.control.get_vol_max_norm();
        this.sink.push_volume();
    }

    toggleMute() {
        if (this.sink) this.sink.change_is_muted(!this.sink.is_muted);
    }

    destroy() {
        this.sink?.disconnectObject(this);
        this.control.disconnectObject(this);
        this.sink = null;
        this.control = null;
    }
}
