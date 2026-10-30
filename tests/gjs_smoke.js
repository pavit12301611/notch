/* Run inside dbus-run-session on Fedora. Does not pretend to test GNOME Shell UI. */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {cpuSample, ClipboardHistory} from '../extension/lib/model.js';
import {notchGeometry} from '../extension/lib/geometry.js';

const history = new ClipboardHistory(2);
history.add('one');
history.add('two');
history.add('three');
if (history.items.length !== 2 || history.items[0].text !== 'three')
    throw new Error('GJS model smoke test failed');
if (cpuSample('cpu 1 0 1 8 0 0 0 0').raw.total !== 10)
    throw new Error('GJS CPU parser failed');
const rect = notchGeometry({x: 0, y: 0, width: 800, height: 600},
    {collapsedWidth: 240, collapsedHeight: 34, expandedWidth: 720, expandedHeight: 440,
        placement: 'panel', floatingMargin: 0, horizontalOffset: 0, panelHeight: 32});
if (rect.x !== 280 || rect.y !== 0) throw new Error('GJS geometry failed');
const directory = GLib.getenv('GSETTINGS_SCHEMA_DIR');
if (directory) {
    const source = Gio.SettingsSchemaSource.new_from_directory(directory,
        Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup('io.github.pavit12301611.Notch', true);
    if (!schema || !schema.has_key('clipboard-enabled') || schema.get_default_value('clipboard-enabled').get_boolean())
        throw new Error('Schema lookup/default privacy check failed');
}
print('GJS model, geometry and schema smoke checks passed');
