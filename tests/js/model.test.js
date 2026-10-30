import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp, notchGeometry, containsPoint, PAGE_SIZES, surfaceRadii} from '../../extension/lib/geometry.js';
import {contentLayout, headerMode, statColumns, availableOpenSize} from '../../extension/lib/layout.js';
import {SpringValue, SpringGeometry, SPRING_PROFILES, easeOutCubic} from '../../extension/lib/spring.js';
import {NotificationBridge} from '../../extension/lib/notifications.js';
import {mediaMetadata, cpuSample, memorySample, networkSample, defaultRouteInterface,
    formatBytes, formatTime, seekTarget, safeTextMimetype, ClipboardHistory, plainText,
    helperErrorMessage} from '../../extension/lib/model.js';

const monitor = {x: 0, y: 0, width: 1920, height: 1080};
const options = {collapsedWidth: 240, collapsedHeight: 34, expandedWidth: 720, expandedHeight: 440,
    placement: 'top-center', floatingMargin: 12, horizontalOffset: 0, panelHeight: 32};

test('geometry uses logical pixels, centers and clamps to the monitor', () => {
    const legacy = notchGeometry(monitor, options);
    assert.equal(legacy.x, 840);
    assert.equal(legacy.y, 38);
    assert.equal(legacy.width, 240);
    assert.equal(legacy.height, 34);
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


test('MacBook notch attaches to the top edge and expands around the same center', () => {
    const mac = {...options, placement: 'panel', collapsedWidth: 185, collapsedHeight: 32,
        expandedWidth: 640, expandedHeight: 320, matchPanelHeight: true, tab: 'home'};
    const closed = notchGeometry(monitor, mac, false);
    const open = notchGeometry(monitor, mac, true);
    assert.equal(closed.y, 0);
    assert.equal(open.y, 0);
    assert.ok(Math.abs((closed.x + closed.width / 2) - (open.x + open.width / 2)) <= 0.5);
    assert.equal(closed.width, 185);
    assert.equal(open.width, 640);
    assert.equal(open.height, PAGE_SIZES.home.height);
    assert.equal(closed.topRadius, 6);
    assert.equal(open.topRadius, 19);
    assert.equal(closed.bottomRadius, 14);
    assert.equal(open.bottomRadius, 24);
    const wings = notchGeometry(monitor, {...mac, mediaWings: true}, false);
    assert.equal(wings.width, closed.width + 64);
    assert.equal(wings.height, closed.height);
    const hover = notchGeometry(monitor, {...mac, hovered: true}, false);
    assert.equal(hover.width, closed.width + 12);
    assert.equal(hover.height, closed.height + 4);
    const peek = notchGeometry(monitor, mac, false, 'peek');
    assert.equal(peek.width, 440);
    assert.equal(peek.height, 32 + 112);
    const hidpi = notchGeometry(monitor, {...mac, cssScale: 2}, false);
    assert.equal(hidpi.width, 370);
    assert.equal(hidpi.topRadius, 12);
});


test('spring converges, survives retargeting and snaps for reduced motion', () => {
    const spring = new SpringValue(0, SPRING_PROFILES.open);
    spring.setTarget(100);
    let overshoot = 0;
    for (let i = 0; i < 240; i++) overshoot = Math.max(overshoot, spring.step(1 / 60));
    assert.ok(overshoot > 100 && overshoot < 115);
    assert.ok(spring.settled);
    assert.equal(spring.value, 100);
    spring.setTarget(0, SPRING_PROFILES.close);
    spring.step(0.2);
    assert.ok(Number.isFinite(spring.value));
    spring.snap(42);
    assert.equal(spring.velocity, 0);
    const geometry = new SpringGeometry({x: 0, y: 0, width: 185, height: 32, topRadius: 6, bottomRadius: 14});
    geometry.setTarget({x: 0, y: 0, width: 640, height: 210, topRadius: 19, bottomRadius: 24}, SPRING_PROFILES.open);
    for (let i = 0; i < 240; i++) geometry.step(1 / 60);
    assert.ok(geometry.settled);
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
    assert.deepEqual(surfaceRadii('closed', {adaptiveCorners: false, cornerRadius: 20}).bottomRadius, 20);
});

test('notification bridge intercepts only ordinary banners and restores the tray', () => {
    const original = () => { fallback++; };
    let fallback = 0;
    const tray = {_notificationQueue: [], connectObject() {}, disconnectObject() {},
        getSources: () => [], emit() {}, count: 0, _showNotification: original};
    const injections = {overrideMethod(object, name, create) { object[name] = create(original); },
        restoreMethod(object, name) { object[name] = original; }};
    const seen = [];
    const bridge = new NotificationBridge({tray, injections, canHandle: () => true,
        onActive: n => seen.push(n), onFallback: () => {}});
    bridge.configure(true, true);
    const ordinary = {urgency: 1, acknowledged: false, playSound() { this.sounded = true; }};
    tray._notificationQueue.push(ordinary);
    tray._showNotification();
    assert.equal(ordinary.acknowledged, true);
    assert.equal(ordinary.sounded, true);
    assert.equal(tray._notificationQueue.length, 0);
    assert.equal(seen.at(-1), ordinary);
    const critical = {urgency: 2};
    tray._notificationQueue.push(critical);
    tray._showNotification();
    assert.equal(fallback, 1);
    bridge.destroy();
    assert.equal(tray._showNotification, original);
});

test('notification markup is rendered as plain text', () => {
    assert.equal(plainText('<b>Hello</b> &amp; <i>world</i><br/>next'), 'Hello & world next');
    assert.equal(plainText(null), '');
});


test('adaptive layout fits the actual notch rectangle and collapses labels before truncation', () => {
    const options = {cssScale: 1, layoutScale: 1, panelHeight: 32, placement: 'panel'};
    for (const monitor of [{width: 1920, height: 1080}, {width: 1366, height: 768},
        {width: 800, height: 600}, {width: 500, height: 400}, {width: 360, height: 640}]) {
        const rect = notchGeometry({...monitor, x: 0, y: 0}, {...options, tab: 'system'}, true);
        const layout = contentLayout(rect, options);
        assert.ok(layout.width * layout.scale <= rect.width + 0.001);
        assert.ok(layout.height * layout.scale <= rect.height - options.panelHeight + 0.001);
        assert.ok(layout.pageHeight > 0);
        assert.ok(rect.x >= 0 && rect.x + rect.width <= monitor.width);
    }
    assert.equal(headerMode(800), 'labels');
    assert.equal(headerMode(640), 'active');
    assert.equal(headerMode(480), 'active');
    assert.equal(headerMode(320), 'icons');
    assert.equal(statColumns(640), 4);
    assert.equal(statColumns(480), 2);
    assert.equal(statColumns(300), 1);
    const hidpi = {cssScale: 2, layoutScale: 1.25, panelHeight: 64, placement: 'panel'};
    const rect = notchGeometry({x: 0, y: 0, width: 1366, height: 768}, {...hidpi, tab: 'home'}, true);
    const layout = contentLayout(rect, hidpi);
    assert.ok(layout.width * layout.scale <= rect.width);
    assert.ok(layout.height * layout.scale <= rect.height - 64);
    const available = availableOpenSize({width: 500, height: 400}, options);
    assert.ok(available.width < 500 && available.height < 400);
    const largeText = {cssScale: 1, layoutScale: 2, contentScale: 1, textScale: 2, panelHeight: 32, placement: 'panel'};
    const largeRect = notchGeometry({x: 0, y: 0, width: 1920, height: 1080}, {...largeText, tab: 'home'}, true);
    const largeLayout = contentLayout(largeRect, largeText);
    assert.ok(largeLayout.width * largeLayout.scale <= largeRect.width);
    assert.ok(largeLayout.effectiveWidth < largeLayout.width);
    assert.equal(largeLayout.layoutScale, 1);
});

test('helper activation errors become actionable instead of raw D-Bus dumps', () => {
    assert.match(helperErrorMessage('GDBus.Error:org.freedesktop.DBus.Error.NameHasNoOwner: Could not activate remote peer'), /Retry/);
    assert.match(helperErrorMessage('GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown'), /notch-doctor/);
    assert.match(helperErrorMessage('Timeout was reached'), /Retry/);
    assert.match(helperErrorMessage('Unknown method'), /installer/);
    assert.equal(helperErrorMessage(''), 'File shelf is unavailable. Press Retry on the Shelf page.');
});
