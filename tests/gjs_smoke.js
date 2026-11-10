/* Run inside dbus-run-session on Fedora. Does not pretend to test GNOME Shell UI. */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {cpuSample, countNotifications, chargingStarted} from '../extension/lib/model.js';
import {Diagnostics} from '../extension/lib/diagnostics.js';
import {headerLayout} from '../extension/lib/layout.js';
import {notchGeometry} from '../extension/lib/geometry.js';

if (countNotifications([{notifications: [1, 2]}, {}]) !== 2)
    throw new Error('GJS notification count smoke test failed');
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
    if (!schema || schema.has_key('clipboard-enabled') || schema.has_key('clipboard-limit') ||
        schema.has_key('closed-media'))
        throw new Error('Removed schema keys are still present');
    for (const key of ['replace-panel-clock', 'idle-clock', 'notifications-in-notch', 'auto-open-notifications']) {
        if (!schema.has_key(key) || !schema.get_key(key).get_default_value().deepUnpack())
            throw new Error(`MacBook default check failed: ${key}`);
    }
    if (schema.get_key('placement').get_default_value().deepUnpack() !== 'panel')
        throw new Error('MacBook placement default check failed');
}
if (!chargingStarted({available: true, state: 2}, {available: true, state: 1}))
    throw new Error('GJS charging transition smoke test failed');
if (chargingStarted(null, {available: true, state: 1}))
    throw new Error('GJS first-sample charging guard failed');
if (headerLayout(600, 1).requiredWidth > 600 || headerLayout(300, 1).requiredWidth > 300)
    throw new Error('GJS header budget smoke test failed');

const [memOk, memBytes] = GLib.file_get_contents('/proc/meminfo');
const memText = memOk ? new TextDecoder().decode(memBytes) : '';
if (!memOk || !memText.includes('MemTotal:'))
    throw new Error(`GLib.file_get_contents(/proc/meminfo) failed: ok=${memOk} len=${memText.length}`);

let diagUpdates = 0;
const loop = GLib.MainLoop.new(null, false);
const diag = new Diagnostics(Gio.File.new_for_path('extension'), () => {
    diagUpdates++;
    if (diagUpdates >= 2 && loop.is_running()) loop.quit();
});
diag.setActive(true);
if (!diag.values?.memory || diag.values.memory.percent === null)
    throw new Error(`Diagnostics immediate memory sample failed: ${JSON.stringify(diag.values)}`);
if (!diag.values?.cpu?.raw)
    throw new Error(`Diagnostics immediate cpu raw sample failed: ${JSON.stringify(diag.values)}`);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
    if (loop.is_running()) loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
if (diag.values.cpu.percent === null || diagUpdates < 2)
    throw new Error(`Diagnostics timer sample failed: updates=${diagUpdates} values=${JSON.stringify(diag.values)}`);
diag.destroy();

print('GJS model, diagnostics, geometry, header, charging and schema smoke checks passed');
