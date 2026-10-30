import Gio from 'gi://Gio';

const DEFINITIONS = [
    {id: 'dnd', label: 'Do Not Disturb', short: 'Focus', icon: 'notifications-disabled-symbolic',
        schema: 'org.gnome.desktop.notifications', key: 'show-banners', invert: true},
    {id: 'night-light', label: 'Night Light', short: 'Night', icon: 'night-light-symbolic',
        schema: 'org.gnome.settings-daemon.plugins.color', key: 'night-light-enabled'},
    {id: 'dark-mode', label: 'Dark Mode', short: 'Dark', icon: 'weather-clear-night-symbolic',
        schema: 'org.gnome.desktop.interface', key: 'color-scheme', string: true},
];

export class QuickActions {
    constructor(settings, onChange) {
        this.items = [];
        this.onChange = onChange;
        const source = Gio.SettingsSchemaSource.get_default();
        for (const definition of DEFINITIONS) {
            if (!settings.get_boolean(`show-${definition.id}`) ||
                !source.lookup(definition.schema, true)) continue;
            const gsettings = new Gio.Settings({schema_id: definition.schema});
            const signal = gsettings.connect(`changed::${definition.key}`, () => this.onChange());
            this.items.push({...definition, gsettings, signal});
        }
    }

    snapshot(item) {
        try {
            const value = item.string ? item.gsettings.get_string(item.key) === 'prefer-dark' :
                item.gsettings.get_boolean(item.key);
            return item.invert ? !value : value;
        } catch {
            return false;
        }
    }

    writable(item) {
        try {
            return item.gsettings.is_writable(item.key);
        } catch {
            return true;
        }
    }

    toggle(item) {
        try {
            if (!this.writable(item))
                return {ok: false, label: item.label, error: `${item.label} is locked by system policy.`};
            const active = this.snapshot(item);
            if (item.string) item.gsettings.set_string(item.key, active ? 'default' : 'prefer-dark');
            else item.gsettings.set_boolean(item.key, item.invert ? active : !active);
            const next = this.snapshot(item);
            this.onChange();
            return {ok: true, label: item.label, active: next};
        } catch (error) {
            return {ok: false, label: item.label, error: error?.message ?? String(error)};
        }
    }

    destroy() {
        for (const item of this.items) {
            try { item.gsettings.disconnect(item.signal); } catch { /* already disconnected */ }
        }
        this.items = [];
    }
}
