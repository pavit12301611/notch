import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {HELPER_ID, HELPER_PATH, call, newProxy, errorMessage} from './dbus.js';
import {helperErrorMessage} from './model.js';

/** Thin client for the GTK drop helper. Only file references, never file contents. */
export class ShelfController {
    constructor(directory, onChange, onError) {
        this.directory = directory;
        this.onChange = onChange;
        this.onError = onError;
        this.items = [];
        this.ready = false;
        this.state = 'offline';
        this.lastError = '';
        this.dead = false;
        this.dropVisible = false;
        this.cancellable = new Gio.Cancellable();
        this.generation = 0;
        this._starting = null;
        this._dropPending = false;
    }

    start() {
        if (this.dead) return Promise.resolve(false);
        if (this._starting) return this._starting;
        this._starting = this._connect().finally(() => { this._starting = null; });
        return this._starting;
    }

    async _connect() {
        const generation = ++this.generation;
        this.ready = false;
        this.state = 'starting';
        this.onChange();
        try {
            const proxy = await newProxy(this.directory, `${HELPER_ID}.xml`, HELPER_ID,
                HELPER_PATH, this.cancellable);
            if (this.dead || generation !== this.generation) return false;
            this.proxy?.disconnectObject(this);
            this.proxy = proxy;
            proxy.connectObject('g-signal', (_p, _sender, signal, params) => {
                if (signal === 'ShelfChanged') this.acceptState(params.deepUnpack()[0]);
            }, 'notify::g-name-owner', p => {
                this.ready = !!p.g_name_owner;
                this.state = this.ready ? 'ready' : 'offline';
                if (this.ready) this.refresh();
                else this.onChange();
            }, this);
            // A method call, not proxy construction, triggers D-Bus/systemd activation.
            await call(proxy, 'Ping', null, 8000);
            if (this.dead || generation !== this.generation) return false;
            this.ready = true;
            this.state = 'ready';
            this.lastError = '';
            await this.refresh();
            this.onChange();
            return true;
        } catch (e) {
            if (this.dead || generation !== this.generation) return false;
            this.ready = false;
            this.state = 'offline';
            this.report(e);
            return false;
        }
    }

    acceptState(json) {
        try {
            const items = JSON.parse(json);
            if (!Array.isArray(items)) return;
            this.items = items.slice(0, 100).filter(i => typeof i.uri === 'string' &&
                i.uri.startsWith('file://') && typeof i.name === 'string');
            this.onChange();
        } catch { this.onError('The shelf helper returned invalid data.'); }
    }

    async refresh() {
        if (!this.ready || this.dead) return false;
        try {
            const [json] = await call(this.proxy, 'List');
            if (!this.dead) this.acceptState(json.deepUnpack());
            return true;
        } catch (e) {
            this.report(e);
            return false;
        }
    }

    async command(method, parameters = null) {
        const ok = this.ready || await this.start();
        if (this.dead) return false;
        if (!ok || !this.ready) {
            this.onError(this.lastError || 'File shelf is offline. Open Shelf and press Retry.');
            return false;
        }
        try {
            const result = await call(this.proxy, method, parameters, 10000);
            if (['Add', 'Remove', 'Clear'].includes(method) && !this.dead)
                this.acceptState(result.deepUnpack()[0]);
            return true;
        } catch (e) {
            this.report(e);
            return false;
        }
    }

    addUris(uris) { return this.command('Add', new GLib.Variant('(as)', [uris])); }
    remove(uri) { return this.command('Remove', new GLib.Variant('(s)', [uri])); }
    clear() { return this.command('Clear'); }
    choose() { return this.command('ChooseFiles'); }
    open(uri) { return this.command('Open', new GLib.Variant('(s)', [uri])); }
    reveal(uri) { return this.command('Reveal', new GLib.Variant('(s)', [uri])); }
    copy(uri) { return this.command('CopyUri', new GLib.Variant('(s)', [uri])); }

    async showDropTarget(rect) {
        if (this.dead || this.dropVisible || this._dropPending) return false;
        this._dropPending = true;
        try {
            const ok = this.ready || await this.start();
            if (!ok || this.dead || !this.ready) return false;
            this.dropVisible = true;
            await call(this.proxy, 'ShowDropTarget', new GLib.Variant('(iiii)',
                [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)]), 4000);
            return true;
        } catch (e) {
            this.dropVisible = false;
            this.report(e);
            return false;
        } finally {
            this._dropPending = false;
        }
    }

    hideDropTarget() {
        if (!this.dropVisible) return;
        this.dropVisible = false;
        if (this.ready) call(this.proxy, 'HideDropTarget').catch(() => {});
    }

    report(error) {
        const raw = errorMessage(error);
        if (!raw || this.dead) return;
        this.lastError = helperErrorMessage(raw);
        if (!this.ready) this.state = 'offline';
        this.onError(this.lastError);
        this.onChange();
    }

    destroy() {
        this.dead = true;
        this.generation++;
        this.hideDropTarget();
        this.cancellable.cancel();
        this.proxy?.disconnectObject(this);
        this.proxy = null;
        this.items = [];
        this.ready = false;
        this.state = 'offline';
    }
}
