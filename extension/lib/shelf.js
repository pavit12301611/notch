import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {HELPER_ID, HELPER_PATH, call, newProxy, errorMessage} from './dbus.js';

/** Thin client for the GTK drop helper. Only file references, never file contents. */
export class ShelfController {
    constructor(directory, onChange, onError) {
        this.directory = directory;
        this.onChange = onChange;
        this.onError = onError;
        this.items = [];
        this.ready = false;
        this.dead = false;
        this.dropVisible = false;
        this.cancellable = new Gio.Cancellable();
        this.generation = 0;
    }

    async start() {
        const generation = ++this.generation;
        try {
            // Intentionally allow D-Bus activation here. The helper is idle until needed.
            const proxy = await newProxy(this.directory, `${HELPER_ID}.xml`, HELPER_ID,
                HELPER_PATH, this.cancellable);
            if (this.dead || generation !== this.generation) return;
            this.proxy?.disconnectObject(this);
            this.proxy = proxy;
            proxy.connectObject('g-signal', (_p, _sender, signal, params) => {
                if (signal === 'ShelfChanged') this.acceptState(params.deepUnpack()[0]);
            }, 'notify::g-name-owner', p => {
                this.ready = !!p.g_name_owner;
                if (this.ready) this.refresh();
                else this.onChange();
            }, this);
            // A method call, not proxy construction, triggers D-Bus/systemd activation.
            await call(proxy, 'Ping', null, 5000);
            if (this.dead || generation !== this.generation) return;
            this.ready = true;
            await this.refresh();
        } catch (e) { this.report(e); }
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
        if (!this.ready || this.dead) return;
        try {
            const [json] = await call(this.proxy, 'List');
            if (!this.dead) this.acceptState(json.deepUnpack());
        } catch (e) { this.report(e); }
    }

    command(method, parameters = null) {
        const execute = () => {
            if (this.dead || !this.ready) return;
            call(this.proxy, method, parameters, 10000).then(result => {
                if (['Add', 'Remove', 'Clear'].includes(method) && !this.dead)
                    this.acceptState(result.deepUnpack()[0]);
            }).catch(e => this.report(e));
        };
        if (!this.ready)
            this.start().then(execute);
        else
            execute();
    }

    addUris(uris) { this.command('Add', new GLib.Variant('(as)', [uris])); }
    remove(uri) { this.command('Remove', new GLib.Variant('(s)', [uri])); }
    clear() { this.command('Clear'); }
    choose() { this.command('ChooseFiles'); }
    open(uri) { this.command('Open', new GLib.Variant('(s)', [uri])); }
    reveal(uri) { this.command('Reveal', new GLib.Variant('(s)', [uri])); }
    copy(uri) { this.command('CopyUri', new GLib.Variant('(s)', [uri])); }

    showDropTarget(rect) {
        if (!this.ready) {
            this.start();
            return;
        }
        if (this.dropVisible) return;
        this.dropVisible = true;
        call(this.proxy, 'ShowDropTarget', new GLib.Variant('(iiii)',
            [rect.x, rect.y, rect.width, rect.height]), 2000).catch(e => {
            this.dropVisible = false;
            this.report(e);
        });
    }

    hideDropTarget() {
        if (!this.dropVisible) return;
        this.dropVisible = false;
        if (this.ready) call(this.proxy, 'HideDropTarget').catch(() => {});
    }

    report(error) {
        const message = errorMessage(error);
        if (!message || this.dead) return;
        this.onError(`File shelf: ${message}`);
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
    }
}
