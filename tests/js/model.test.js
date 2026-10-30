import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp, notchGeometry, containsPoint} from '../../extension/lib/geometry.js';
import {mediaMetadata, cpuSample, memorySample, networkSample, defaultRouteInterface,
    formatBytes, formatTime, seekTarget, safeTextMimetype, ClipboardHistory} from '../../extension/lib/model.js';

const monitor = {x: 0, y: 0, width: 1920, height: 1080};
const options = {collapsedWidth: 240, collapsedHeight: 34, expandedWidth: 720, expandedHeight: 440,
    placement: 'top-center', floatingMargin: 12, horizontalOffset: 0, panelHeight: 32};

test('geometry uses logical pixels, centers and clamps to the monitor', () => {
    assert.deepEqual(notchGeometry(monitor, options), {x: 840, y: 38, width: 240, height: 34});
    assert.deepEqual(notchGeometry({...monitor, x: 1920}, options).x, 2760);
    assert.equal(notchGeometry(monitor, {...options, placement: 'panel'}).y, 0);
    assert.equal(notchGeometry(monitor, {...options, placement: 'floating'}).y, 12);
    const tiny = notchGeometry({x: 0, y: 0, width: 200, height: 100}, options, true);
    assert.ok(tiny.x >= 0 && tiny.x + tiny.width <= 200);
    assert.ok(tiny.y >= 0 && tiny.y + tiny.height <= 100);
    assert.equal(clamp(99, 0, 10), 10);
    assert.ok(containsPoint({x: 0, y: 0, width: 10, height: 10}, 0, 0));
    assert.ok(!containsPoint({x: 0, y: 0, width: 10, height: 10}, 10, 0));
});

test('MPRIS metadata tolerates malformed players and recursive variants', () => {
    const metadata = mediaMetadata({'xesam:title': 'Song', 'xesam:artist': ['A', 'B'],
        'mpris:length': 123456789, 'mpris:trackid': '/org/example/track/1'});
    assert.equal(metadata.title, 'Song');
    assert.equal(metadata.artist, 'A, B');
    assert.equal(metadata.lengthUs, 123456789);
    assert.equal(mediaMetadata({'xesam:artist': 'wrong', 'mpris:length': -5}).artist, '');
    assert.equal(mediaMetadata({'mpris:length': 'bad'}).lengthUs, 0);
    assert.equal(mediaMetadata({deepUnpack: () => ({'xesam:title': 'Wrapped'})}).title, 'Wrapped');
    assert.equal(mediaMetadata({'mpris:trackid': 'not-an-object-path'}).trackId, '');
    assert.equal(seekTarget(1000, 2), 1000);
    assert.equal(seekTarget(1000, -1), 0);
});

test('CPU deltas exclude guest double-counting and handle first sample/reset', () => {
    const first = cpuSample('cpu  10 0 10 70 10 0 0 0 5 0\ncpu0 1 2 3');
    assert.equal(first.percent, null);
    assert.equal(first.raw.total, 100);
    const second = cpuSample('cpu  20 0 20 140 20 0 0 0 10 0', first.raw);
    assert.ok(Math.abs(second.percent - 20) < 1e-9);
    assert.equal(cpuSample('cpu  1 0 0 1 0', first.raw).percent, null);
    assert.equal(cpuSample('garbage').percent, null);
});

test('RAM uses MemAvailable rather than MemFree', () => {
    const result = memorySample('MemTotal: 1000 kB\nMemFree: 100 kB\nMemAvailable: 400 kB\n');
    assert.equal(result.percent, 60);
    assert.equal(result.used, 600 * 1024);
    assert.equal(memorySample('MemTotal: 0 kB').percent, null);
});

test('network rates use elapsed time, default route and reject counter resets', () => {
    const text = 'Inter-| Receive | Transmit\n face | bytes ...\neth0: 100 0 0 0 0 0 0 0 300 0 0 0 0 0 0 0\nlo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0';
    const first = networkSample(text);
    assert.deepEqual(first.raw, {rx: 100, tx: 300, interface: 'eth0'});
    const nextText = 'Inter-| Receive | Transmit\n face | bytes ...\neth0: 300 0 0 0 0 0 0 0 600 0 0 0 0 0 0 0\nlo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0';
    const second = networkSample(nextText, first.raw, 2);
    assert.equal(second.download, 100);
    assert.equal(second.upload, 150);
    assert.equal(networkSample(text, {rx: 9999, tx: 9999, interface: 'eth0'}).download, null);
    assert.equal(defaultRouteInterface('Iface Destination Gateway Flags RefCnt Use Metric Mask\nwlan0 00000000 0100A8C0 0003 0 0 100 00000000'), 'wlan0');
});

test('clipboard offers are conservative and history is bounded/deduplicated', () => {
    assert.equal(safeTextMimetype(['text/plain;charset=utf-8', 'UTF8_STRING']), 'text/plain;charset=utf-8');
    assert.equal(safeTextMimetype(['text/plain', 'x-kde-passwordManagerHint']), '');
    assert.equal(safeTextMimetype(['image/png', 'text/plain']), '');
    assert.equal(safeTextMimetype([]), '');
    const history = new ClipboardHistory(3);
    assert.ok(history.add('one', 1));
    assert.ok(history.add('two', 2));
    assert.ok(history.add('three', 3));
    assert.ok(history.add('four', 4));
    assert.deepEqual(history.items.map(i => i.text), ['four', 'three', 'two']);
    assert.ok(history.add('two', 5));
    assert.equal(history.items[0].text, 'two');
    assert.equal(history.items.length, 3);
    assert.ok(!history.add('two', 6));
    assert.ok(!history.add('bad\0text'));
    assert.ok(!history.add('x'.repeat(65537)));
    history.setLimit(1);
    assert.equal(history.items.length, 1);
    history.clear();
    assert.equal(history.items.length, 0);
});

test('formatting is stable for missing values and boundaries', () => {
    assert.equal(formatBytes(null), '—');
    assert.equal(formatBytes(1024, '/s'), '1.0 KiB/s');
    assert.equal(formatTime(65e6), '1:05');
    assert.equal(formatTime(-1), '0:00');
});
