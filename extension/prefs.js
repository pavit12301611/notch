import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import {ExtensionPreferences} from 'resource:///org/gnome/shell/extensions/prefs.js';
import {makeSettingsButton} from './lib/launcher.js';

/** Fallback for extension managers that open prefs.js instead of openPreferences(). */
export default class NotchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        const status = new Adw.StatusPage({title: 'Notch',
            description: 'Appearance, placement, media, privacy and file shelf settings are in the GTK4/Libadwaita companion app.',
            icon_name: 'io.github.pavit12301611.Notch',
            child: makeSettingsButton(Gtk)});
        group.add(status);
        page.add(group);
        window.add(page);
    }
}
