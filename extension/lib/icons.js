import Gio from 'gi://Gio';

let iconDirectory = null;
const cache = new Map();

/** Use bundled monochrome chrome icons so Shell themes cannot recolor them blue. */
export function setIconDirectory(directory) {
    iconDirectory = directory;
    cache.clear();
}

export function iconGicon(name) {
    if (cache.has(name)) return cache.get(name);
    let gicon = null;
    if (iconDirectory) {
        try {
            const file = iconDirectory.get_child(`${name}.svg`);
            if (file.query_exists(null)) gicon = new Gio.FileIcon({file});
        } catch { /* Fall back to the themed icon below. */ }
    }
    if (!gicon) gicon = Gio.ThemedIcon.new(name);
    cache.set(name, gicon);
    return gicon;
}

export function setNotchIcon(widget, name) {
    if (!widget) return;
    widget.icon_name = null;
    widget.gicon = iconGicon(name);
}
