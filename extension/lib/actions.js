import Gio from 'gi://Gio';

const DEFINITIONS = [
    {id: 'dnd', label: 'Do Not Disturb', icon: 'notifications-disabled-symbolic',
        schema: 'org.gnome.desktop.notifications', key: 'show-banners', invert: true},
    {id: 'night-light', label: 'Night Light', icon: 'night-light-symbolic',
        schema: 'org.gnome.settings-daemon.plugins.color', key: 'night-light-enabled'},
    {id: 'dark-mode', label: 'Dark Mode', icon: 'weather-clear-night-symbolic',
        schema: 'org.gnome.desktop.interface', key: 'color-scheme', string: true},
];

export class QuickActions {
    constructor(settings, onChange) {
        this.items = [];
        const source = Gio.SettingsSchemaSource.get_default();
        for (const definition of DEFINITIONS) {
            if (!settings.get_boolean(`show-${definition.id}`) ||
                !source.lookup(definition.schema, true)) continue;
            const gsettings = new Gio.Settings({schema_id: definition.schema});
            const signal = gsettings.connect(`changed::${definition.key}`, onChange);
            this.items.push({...definition, gsettings, signal});
        }
        this.onChange = onChange;
    }

    snapshot(item) {
        const value = item.string ? item.gsettings.get_string(item.key) === 'prefer-dark' :
            item.gsettings.get_boolean(item.key);
        return item.invert ? !value : value;
    }

    toggle(item) {
        const active = this.snapshot(item);
        if (item.string) item.gsettings.set_string(item.key, active ? 'default' : 'prefer-dark');
        else item.gsettings.set_boolean(item.key, item.invert ? active : !active);
        this.onChange();
    }

    destroy() {
        for (const item of this.items) item.gsettings.disconnect(item.signal);
        this.items = [];
    }
}
