import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {call, newProxy, errorMessage} from './dbus.js';
import {mediaMetadata, seekTarget} from './model.js';

const PLAYER = 'org.mpris.MediaPlayer2.Player';
const PREFIX = 'org.mpris.MediaPlayer2.';
const OBJECT = '/org/mpris/MediaPlayer2';
const NO_PLAYER = {names: [], name: '', identity: 'No media player', title: 'Nothing playing',
    artist: '', album: '', artUrl: '', status: 'Stopped', lengthUs: 0, positionUs: 0,
    trackId: '', volume: 1, rate: 1, canControl: false, canPlay: false, canPause: false,
    canSeek: false, canGoNext: false, canGoPrevious: false};

/** MPRIS v2 client. Name/property/seek events do the work; only visible Position polls. */
export class MediaController {
    constructor(directory, onChange, onError = () => {}) {
        this.directory = directory;
        this.onChange = onChange;
        this.onError = onError;
        this.players = new Map();
        this.selected = '';
        this.manualSelection = false;
        this.cancellable = new Gio.Cancellable();
        this.dead = false;
        this.positionPending = false;
        this.position = {name: '', trackId: '', value: 0, updated: 0};
        this.watch = 0;
        this._changeTimer = 0;
    }

    start() {
        this.watch = Gio.DBus.session.signal_subscribe('org.freedesktop.DBus',
            'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus', null,
            Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _iface, _signal, params) => {
                const [name, oldOwner, newOwner] = params.deepUnpack();
                if (!name.startsWith(PREFIX)) return;
                if (oldOwner) this.remove(name);
                if (newOwner) this.add(name);
            });
        new Promise((resolve, reject) => {
            Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'ListNames', null, null, Gio.DBusCallFlags.NONE,
                1500, this.cancellable, (connection, result) => {
                    try { resolve(connection.call_finish(result)); } catch (e) { reject(e); }
                });
        }).then(result => {
            const names = result.deepUnpack()[0];
            if (!this.dead && Array.isArray(names))
                names.filter(n => typeof n === 'string' && n.startsWith(PREFIX)).forEach(n => this.add(n));
        }).catch(e => this.report(e));
    }

    async add(name) {
        if (this.dead || this.players.has(name)) return;
        try {
            const flags = Gio.DBusProxyFlags.DO_NOT_AUTO_START;
            const [root, player] = await Promise.all([
                newProxy(this.directory, 'org.mpris.MediaPlayer2.xml', name, OBJECT, this.cancellable, flags),
                newProxy(this.directory, 'org.mpris.MediaPlayer2.Player.xml', name, OBJECT, this.cancellable, flags),
            ]);
            if (this.dead || !player.g_name_owner) return;
            if (this.players.has(name)) this.remove(name);
            const entry = {name, root, player};
            this.players.set(name, entry);
            player.connectObject('g-properties-changed', (_p, changed) => {
                const keys = changed.deepUnpack();
                if ('Metadata' in keys) this.position.value = 0;
                if ('Metadata' in keys || 'PlaybackStatus' in keys || 'Rate' in keys)
                    this.refreshPosition();
                if ('Metadata' in keys || 'PlaybackStatus' in keys) this.preferPlaying();
                this.scheduleChange();
            }, 'g-signal', (_p, _sender, signal, params) => {
                if (signal === 'Seeked') {
                    this.setPosition(name, params.deepUnpack()[0]);
                    this.scheduleChange();
                }
            }, 'notify::g-name-owner', proxy => {
                if (!proxy.g_name_owner) this.remove(name);
            }, this);
            root.connectObject('notify::g-name-owner', proxy => {
                if (!proxy.g_name_owner) this.remove(name);
            }, this);
            if (!this.players.has(this.selected)) this.selected = name;
            this.preferPlaying();
            this.refreshPosition();
            this.scheduleChange();
        } catch (e) { this.report(e); }
    }

    remove(name) {
        const entry = this.players.get(name);
        if (!entry) return;
        entry.player.disconnectObject(this);
        entry.root.disconnectObject(this);
        this.players.delete(name);
        if (this.selected === name) {
            this.manualSelection = false;
            this.selected = this.players.keys().next().value ?? '';
            this.preferPlaying();
            this.refreshPosition();
        }
        this.scheduleChange();
    }

    scheduleChange() {
        if (this.dead || this._changeTimer) return;
        this._changeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._changeTimer = 0;
            if (!this.dead) this.onChange();
            return GLib.SOURCE_REMOVE;
        });
    }

    snapshot() {
        const entry = this.players.get(this.selected);
        if (!entry) return {...NO_PLAYER, names: []};
        const p = entry.player;
        const metadata = mediaMetadata(p.Metadata);
        let positionUs = 0;
        if (this.position.name === this.selected && this.position.trackId === metadata.trackId) {
            positionUs = this.position.value;
            if (p.PlaybackStatus === 'Playing')
                positionUs += Math.max(0, GLib.get_monotonic_time() - this.position.updated) * (p.Rate || 1);
        }
        if (metadata.lengthUs > 0) positionUs = Math.min(positionUs, metadata.lengthUs);
        return {names: [...this.players.keys()], name: this.selected,
            identity: entry.root.Identity || this.selected.slice(PREFIX.length),
            ...metadata, status: p.PlaybackStatus || 'Stopped', positionUs,
            volume: typeof p.Volume === 'number' ? Math.max(0, Math.min(1, p.Volume)) : 1,
            rate: p.Rate || 1, canControl: !!p.CanControl, canPlay: !!p.CanPlay,
            canPause: !!p.CanPause, canSeek: !!p.CanSeek,
            canGoNext: !!p.CanGoNext, canGoPrevious: !!p.CanGoPrevious};
    }

    setPositionActive(active) {
        if (active && !this.positionTimer) {
            this.refreshPosition();
            this.scheduleChange();
            this.positionTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this.refreshPosition();
                this.scheduleChange();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!active && this.positionTimer) {
            GLib.source_remove(this.positionTimer);
            this.positionTimer = 0;
        }
    }

    preferPlaying() {
        if (this.manualSelection || this.dead) return;
        const current = this.players.get(this.selected);
        if (current?.player.PlaybackStatus === 'Playing') return;
        const playing = [...this.players.values()]
            .filter(p => p.player.PlaybackStatus === 'Playing')
            .sort((a, b) => Number(!!mediaMetadata(b.player.Metadata).title) - Number(!!mediaMetadata(a.player.Metadata).title))[0];
        if (playing && playing.name !== this.selected) {
            this.selected = playing.name;
            this.refreshPosition();
        }
    }

    cyclePlayer() {
        const names = [...this.players.keys()];
        if (!names.length) return;
        this.manualSelection = true;
        this.selected = names[(names.indexOf(this.selected) + 1) % names.length];
        this.refreshPosition();
        this.scheduleChange();
    }

    setPosition(name, value) {
        this.position = {name, trackId: mediaMetadata(this.players.get(name)?.player.Metadata).trackId,
            value: Math.max(0, Number(value) || 0), updated: GLib.get_monotonic_time()};
    }

    refreshPosition() {
        const entry = this.players.get(this.selected);
        if (!entry || this.positionPending || this.dead) return;
        this.positionPending = true;
        const name = this.selected;
        call(entry.player, 'org.freedesktop.DBus.Properties.Get',
            new GLib.Variant('(ss)', [PLAYER, 'Position'])).then(result => {
            let value = result.deepUnpack()[0];
            if (value?.deepUnpack) value = value.deepUnpack();
            if (!this.dead && this.players.has(name)) this.setPosition(name, value);
        }).catch(() => { /* Position is not emitted as a property-change by many players. */ })
            .finally(() => { this.positionPending = false; });
    }

    command(method, parameters = null) {
        const entry = this.players.get(this.selected);
        if (!entry) return;
        call(entry.player, method, parameters).catch(e => this.report(e));
    }

    playPause() { this.command('PlayPause'); }
    next() { this.command('Next'); }
    previous() { this.command('Previous'); }

    seekTo(fraction) {
        const state = this.snapshot();
        if (!state.canSeek || state.lengthUs <= 0) return;
        const target = seekTarget(state.lengthUs, fraction);
        if (state.trackId)
            this.command('SetPosition', new GLib.Variant('(ox)', [state.trackId, target]));
        else
            this.command('Seek', new GLib.Variant('(x)', [target - state.positionUs]));
        this.setPosition(this.selected, target);
        this.scheduleChange();
    }

    setVolume(value) {
        const entry = this.players.get(this.selected);
        if (!entry) return;
        const next = Math.max(0, Math.min(1, value));
        if (typeof entry.player.Volume === 'number' && Math.abs(entry.player.Volume - next) < 0.002) return;
        const parameters = new GLib.Variant('(ssv)', [PLAYER, 'Volume',
            new GLib.Variant('d', next)]);
        call(entry.player, 'org.freedesktop.DBus.Properties.Set', parameters)
            .catch(e => this.report(e));
    }

    raise() {
        const root = this.players.get(this.selected)?.root;
        if (root?.CanRaise) call(root, 'Raise').catch(e => this.report(e));
    }

    report(error) {
        const message = errorMessage(error);
        if (message && !this.dead) this.onError(message);
    }

    destroy() {
        this.setPositionActive(false);
        if (this._changeTimer) GLib.source_remove(this._changeTimer);
        this._changeTimer = 0;
        this.dead = true;
        this.cancellable.cancel();
        if (this.watch) Gio.DBus.session.signal_unsubscribe(this.watch);
        this.watch = 0;
        for (const name of [...this.players.keys()]) {
            const entry = this.players.get(name);
            entry.player.disconnectObject(this);
            entry.root.disconnectObject(this);
        }
        this.players.clear();
    }
}
