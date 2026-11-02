/* Run inside dbus-run-session on Fedora. Does not pretend to test GNOME Shell UI. */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {cpuSample, mediaErrorMessage, countNotifications, chargingStarted} from '../extension/lib/model.js';
import {FEATURES, Countdown, calendarMonth} from '../extension/lib/features.js';
import {headerLayout} from '../extension/lib/layout.js';
import {notchGeometry} from '../extension/lib/geometry.js';

if (mediaErrorMessage('NotSupported') !== 'This player does not support that control.')
    throw new Error('GJS media error smoke test failed');
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
    if (!schema || schema.has_key('clipboard-enabled') || schema.has_key('clipboard-limit'))
        throw new Error('Removed clipboard schema keys are still present');
    for (const key of ['replace-panel-clock', 'idle-clock', 'notifications-in-notch', 'auto-open-notifications']) {
        if (!schema.has_key(key) || !schema.get_default_value(key).get_boolean())
            throw new Error(`MacBook default check failed: ${key}`);
    }
    for (const [key] of FEATURES) {
        if (!schema.has_key(key) || schema.get_default_value(key).get_boolean())
            throw new Error(`Optional feature must default off: ${key}`);
    }
    if (schema.get_default_value('placement').get_string() !== 'panel')
        throw new Error('MacBook placement default check failed');
}
if (!chargingStarted({available: true, state: 2}, {available: true, state: 1}))
    throw new Error('GJS charging transition smoke test failed');
if (chargingStarted(null, {available: true, state: 1}))
    throw new Error('GJS first-sample charging guard failed');
if (headerLayout(600, 1).requiredWidth > 600 || headerLayout(300, 1).requiredWidth > 300)
    throw new Error('GJS header budget smoke test failed');
const countdown = new Countdown(() => 0);
countdown.reset(60);
countdown.start();
if (!countdown.running || countdown.seconds() !== 60 || calendarMonth(2024, 1).cells.filter(cell => cell.day).length !== 29)
    throw new Error('GJS optional timer/calendar smoke failed');
print('GJS model, geometry, header, charging and schema smoke checks passed');
