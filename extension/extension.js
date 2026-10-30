import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {NotchView} from './lib/view.js';
import {APP_ID, EXTENSION_ID, EXTENSION_PATH, interfaceXml} from './lib/dbus.js';

export default class NotchExtension extends Extension {
    enable() {
        if (this.view) return;
        this.settings = this.getSettings();
        // Migrate untouched 0.1 defaults to the requested MacBook-style notch.
        // Customized geometries are left alone; the preset is also available in Settings.
        if (this.settings.get_string('placement') === 'top-center' &&
            this.settings.get_int('collapsed-width') === 240 &&
            this.settings.get_int('expanded-width') === 720) {
            this.settings.set_string('placement', 'panel');
            this.settings.set_int('collapsed-width', 220);
            this.settings.set_int('expanded-width', 760);
            this.settings.set_int('expanded-height', 480);
            this.settings.set_int('corner-radius', 18);
            this.settings.set_double('opacity', 1.0);
            this.settings.set_boolean('replace-panel-clock', true);
            this.settings.set_boolean('idle-clock', true);
            this.settings.set_boolean('notifications-in-notch', true);
            this.settings.set_boolean('auto-open-notifications', true);
        }
        this.view = new NotchView(this);
        this.keybindingAdded = Main.wm.addKeybinding('toggle-notch', this.settings,
            Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this.view?.toggle());
        const xml = interfaceXml(this.dir, `${APP_ID}.xml`);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(xml, {
            Toggle: () => this.view?.toggle(),
            SetExpanded: expanded => this.view?.setExpanded(expanded),
            ClearClipboard: () => this.view?.clipboard.clear(),
            GetState: () => this.view?.state() ?? '{}',
        });
        this.dbus.export(Gio.DBus.session, EXTENSION_PATH);
        this.busOwnerId = Gio.bus_own_name(Gio.BusType.SESSION, EXTENSION_ID,
            Gio.BusNameOwnerFlags.NONE, null, null, null);
    }

    disable() {
        if (this.busOwnerId) Gio.bus_unown_name(this.busOwnerId);
        this.busOwnerId = 0;
        this.dbus?.unexport();
        this.dbus = null;
        if (this.keybindingAdded) Main.wm.removeKeybinding('toggle-notch');
        this.keybindingAdded = false;
        this.view?.destroy();
        this.view = null;
        this.settings = null;
    }
}
