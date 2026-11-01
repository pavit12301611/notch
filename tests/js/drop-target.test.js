import test from 'node:test';
import assert from 'node:assert/strict';
import {notchGeometry, notchDropGeometry, nearDropTarget, PAGE_SIZES} from '../../extension/lib/geometry.js';
import {contentLayout} from '../../extension/lib/layout.js';

const monitor = {x: 0, y: 0, width: 1920, height: 1080, index: 0};
const options = {placement: 'panel', collapsedWidth: 185, collapsedHeight: 32, expandedWidth: 640,
    expandedHeight: 360, panelHeight: 32, cssScale: 1, layoutScale: 1, horizontalOffset: 0, tab: 'home'};

test('Home keeps clock, player and Quick stash in the default viewport', () => {
    assert.equal(PAGE_SIZES.home.height, 360);
    const rect = notchGeometry(monitor, options, true);
    assert.equal(rect.height, 360);
    const layout = contentLayout(rect, {...options, contentScale: 1, textScale: 1});
    assert.ok(layout.pageHeight >= 240, `Home page height ${layout.pageHeight} is too small`);
});

test('drop target covers the closed notch itself, not only a window below the panel', () => {
    const closed = notchGeometry(monitor, options, false);
    const target = notchDropGeometry(monitor, options);
    assert.equal(target.y, closed.y);
    assert.ok(target.x <= closed.x);
    assert.ok(target.x + target.width >= closed.x + closed.width);
    assert.ok(target.height >= closed.height + 120);
    assert.ok(nearDropTarget(closed.x + closed.width / 2, closed.y + closed.height / 2, target, 0));
    assert.ok(!nearDropTarget(10, 900, target, 48));
});

test('drop target follows placement, scale and monitor clamping', () => {
    const floating = notchDropGeometry(monitor, {...options, placement: 'floating', floatingMargin: 12});
    assert.equal(floating.y, 12);
    const hidpi = notchDropGeometry(monitor, {...options, cssScale: 2});
    assert.ok(hidpi.width >= 640 * 2);
    const tiny = notchDropGeometry({x: 0, y: 0, width: 360, height: 240}, options);
    assert.ok(tiny.x >= 0 && tiny.x + tiny.width <= 360);
    assert.ok(tiny.y >= 0 && tiny.y + tiny.height <= 240);
    const second = notchDropGeometry({...monitor, x: 1920}, options);
    assert.ok(second.x >= 1920 && second.x + second.width <= 3840);
});
