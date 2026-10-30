import GLib from 'gi://GLib';

export function settingsCommand() {
    return GLib.find_program_in_path('notch-settings') ??
        [`${GLib.get_home_dir()}/.local/bin/notch-settings`, '/usr/local/bin/notch-settings',
            '/usr/bin/notch-settings'].find(path => GLib.file_test(path, GLib.FileTest.IS_EXECUTABLE)) ??
        'notch-settings';
}

export function launchSettings() {
    GLib.spawn_async(null, [settingsCommand()], null, GLib.SpawnFlags.SEARCH_PATH, null);
}

export function makeSettingsButton(Gtk) {
    const button = new Gtk.Button({label: 'Open Notch Settings', halign: Gtk.Align.CENTER});
    button.add_css_class('pill');
    button.add_css_class('suggested-action');
    button.connect('clicked', () => {
        try { launchSettings(); } catch (e) { console.error(e.message); }
    });
    return button;
}
