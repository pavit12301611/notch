import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const APP_ID = 'io.github.pavit12301611.Notch';
export const EXTENSION_PATH = '/io/github/pavit12301611/Notch';
export const EXTENSION_ID = `${APP_ID}.Extension`;
export const HELPER_ID = `${APP_ID}.Helper`;
export const HELPER_PATH = `${EXTENSION_PATH}/Shelf`;

export function interfaceXml(directory, filename) {
    const [ok, bytes] = directory.get_child('dbus').get_child(filename).load_contents(null);
    if (!ok) throw new Error(`Cannot read D-Bus interface ${filename}`);
    return new TextDecoder().decode(bytes);
}

/** A cancellable, never-auto-starting proxy for an already-running service. */
export function newProxy(directory, filename, name, path, cancellable, flags = Gio.DBusProxyFlags.NONE) {
    const info = Gio.DBusInterfaceInfo.new_for_xml(interfaceXml(directory, filename));
    return new Promise((resolve, reject) => {
        Gio.DBusProxy.new(Gio.DBus.session, flags, info, name, path, info.name,
            cancellable, (source, result) => {
                try { resolve(Gio.DBusProxy.new_finish(result)); } catch (e) { reject(e); }
            });
    });
}

export function call(proxy, method, parameters = null, timeout = 1500) {
    return new Promise((resolve, reject) => {
        proxy.call(method, parameters, Gio.DBusCallFlags.NONE, timeout, null,
            (source, result) => {
                try { resolve(source.call_finish(result)); } catch (e) { reject(e); }
            });
    });
}

export function errorMessage(error) {
    if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) return '';
    return error?.message ?? String(error);
}

export function timeout(milliseconds, callback) {
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
        callback();
        return GLib.SOURCE_REMOVE;
    });
    return id;
}
