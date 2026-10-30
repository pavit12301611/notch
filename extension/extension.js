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
