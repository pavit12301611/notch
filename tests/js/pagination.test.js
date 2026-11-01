import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_CAPACITY, clampPage, pageSlice, pageLabel} from '../../extension/lib/pagination.js';

test('non-scrolling pages expose every item through bounded pagination', () => {
    const items = Array.from({length: 5}, (_, i) => ({id: i}));
    const first = pageSlice(items, 0, PAGE_CAPACITY.shelf);
    assert.deepEqual(first.items.map(i => i.id), [0, 1]);
    assert.equal(first.totalPages, 3);
    assert.equal(first.hasPrevious, false);
    assert.equal(first.hasNext, true);
    const last = pageSlice(items, 99, PAGE_CAPACITY.shelf);
    assert.deepEqual(last.items.map(i => i.id), [4]);
    assert.equal(last.page, 2);
    assert.equal(last.hasNext, false);
    assert.equal(pageLabel(last.page, last.totalPages), '3 / 3');
});

test('empty and invalid pagination inputs stay safe', () => {
    assert.deepEqual(pageSlice([], 0, 2).items, []);
    assert.equal(pageSlice([], 0, 2).totalPages, 1);
    assert.equal(clampPage(-5, 0, 0).page, 0);
    assert.equal(clampPage(1.9, 3, 2).page, 1);
    assert.equal(pageLabel(0, 0), '1 / 1');
});
