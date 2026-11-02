import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarMonth, sameDate, shiftCalendarMonth, notificationAppId, notificationText,
    peekAllowed, osdKind, bluetoothDevices} from '../../extension/lib/features.js';
import {notchGeometry} from '../../extension/lib/geometry.js';
import {mediaMetadata} from '../../extension/lib/model.js';

const source = {title: 'Chat', policy: {id: 'org.example.Chat'}};

test('calendar handles leap years, Monday alignment and adjacent year navigation', () => {
    const feb = calendarMonth(2024, 1, new Date(2024, 1, 29, 23));
    assert.equal(feb.cells.filter(cell => cell.inMonth).length, 29);
    assert.equal(feb.cells.findIndex(cell => cell.inMonth && cell.day === 1), 3);
    assert.equal(feb.cells.find(cell => cell.today).day, 29);
    assert.equal(feb.cells.length, 42);
    assert.equal(feb.cells[0].date.getMonth(), 0);
    assert.equal(feb.cells.at(-1).date.getMonth(), 2);
    assert.equal(feb.cells.filter(cell => cell.weekend).length, 12);
    assert.equal(calendarMonth(2023, 1).cells.filter(cell => cell.inMonth).length, 28);
    assert.equal(calendarMonth(2024, 0).cells[0].day, 1);
    assert.equal(calendarMonth(2024, 12).year, 2025);
    assert.equal(calendarMonth(2024, -1).year, 2023);
    assert.equal(calendarMonth(2024, 11, new Date(2024, 0, 1)).cells.some(cell => cell.today), false);
});

test('privacy produces no sensitive title/body text and restores originals when off', () => {
    const notification = {title: 'OTP 123456', body: 'Private sender: secret', source};
    assert.deepEqual(notificationText(notification, true), {title: 'Chat', body: 'New notification'});
    assert.deepEqual(notificationText(notification, false), {title: notification.title, body: notification.body});
    assert.deepEqual(notificationText({}, true), {title: 'Notification', body: 'New notification'});
    assert.equal(notification.title, 'OTP 123456');
});

test('per-app peek rules use desktop IDs and exact generic source names, only when enabled', () => {
    assert.equal(notificationAppId(source), 'org.example.Chat');
    assert.equal(notificationAppId({app: {get_id: () => 'foo.desktop'}}), 'foo');
    assert.equal(peekAllowed(source, true, ['org.example.Chat.desktop']), false);
    assert.equal(peekAllowed(source, true, ['org.example.Chat']), false);
    assert.equal(peekAllowed(source, false, ['org.example.Chat']), true);
    assert.equal(peekAllowed(source, true, ['other']), true);
    const generic = {title: 'notify-send', policy: {id: 'generic'}};
    assert.equal(peekAllowed(generic, true, ['notify-send']), false);
    assert.equal(notificationAppId(generic), 'notify-send');
});

test('OSD classification leaves microphone and unrelated OSDs native', () => {
    const icon = name => ({get_names: () => [name]});
    assert.equal(osdKind(icon('audio-volume-high-symbolic')), 'volume');
    assert.equal(osdKind(icon('audio-volume-muted-symbolic')), 'volume');
    assert.equal(osdKind(icon('display-brightness-symbolic')), 'brightness');
    assert.equal(osdKind(icon('keyboard-brightness-symbolic')), 'brightness');
    assert.equal(osdKind(icon('microphone-sensitivity-high-symbolic')), null);
    assert.equal(osdKind(icon('network-wireless-symbolic')), null);
    assert.equal(osdKind({}), null);
    assert.equal(osdKind(null), null);
});

function device(path, connected, percentage, alias) {
    const iface = values => ({get_cached_property: key => key in values ? {deepUnpack: () => values[key]} : null});
    return {get_object_path: () => path, get_interface: name => name === 'org.bluez.Device1' ?
        iface({Connected: connected, Alias: alias}) : percentage === null ? null : iface({Percentage: percentage})};
}

test('BlueZ data tolerates unsupported devices, missing battery and disconnected objects', () => {
    const devices = bluetoothDevices([
        device('/c', true, 82, 'Headphones'), device('/a', false, 25, 'Disconnected'),
        device('/b', true, null, 'Mouse'), device('/d', true, 255, ''),
    ]);
    assert.deepEqual(devices, [
        {path: '/b', name: 'Mouse', percent: null},
        {path: '/c', name: 'Headphones', percent: 82},
        {path: '/d', name: 'Bluetooth device', percent: 100},
    ]);
});

test('optional geometry grows existing pages, never grows beyond the monitor', () => {
    const monitor = {x: 0, y: 0, width: 1280, height: 720};
    const options = {placement: 'panel', tab: 'home', panelHeight: 32, expandedHeight: 480};
    assert.equal(notchGeometry(monitor, options, true).height, 220);
    assert.equal(notchGeometry(monitor, {...options, tab: 'calendar'}, true).height, 480);
    const small = notchGeometry({...monitor, height: 240}, {...options, tab: 'calendar'}, true);
    assert.ok(small.height <= 240);
    assert.ok(small.y + small.height <= 240);
});

test('MPRIS carries optional artwork metadata without changing playback capabilities', () => {
    const metadata = mediaMetadata({'mpris:artUrl': 'file:///tmp/art.png', 'xesam:title': 'Song'});
    assert.equal(metadata.artUrl, 'file:///tmp/art.png');
    assert.equal(mediaMetadata({'mpris:artUrl': 42}).artUrl, '');
});

test('month navigation clamps day selection, handles leap years and year boundaries', () => {
    const feb = shiftCalendarMonth(new Date(2024, 0, 31, 12), 1);
    assert.equal(feb.getMonth(), 1);
    assert.equal(feb.getDate(), 29);
    assert.equal(shiftCalendarMonth(new Date(2023, 0, 31, 12), 1).getDate(), 28);
    assert.equal(shiftCalendarMonth(new Date(2024, 11, 15, 12), 1).getFullYear(), 2025);
    assert.equal(shiftCalendarMonth(new Date(2024, 0, 15, 12), -1).getFullYear(), 2023);
    assert.equal(sameDate(new Date(2024, 0, 1, 0), new Date(2024, 0, 1, 23)), true);
});
