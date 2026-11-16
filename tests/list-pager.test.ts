import assert from 'node:assert/strict';
import test from 'node:test';
import { pageSlice } from '../src/components/list-pager';

test('pageSlice pages drafts in eights', () => {
  const items = Array.from({ length: 21 }, (_, i) => i + 1);
  const page1 = pageSlice(items, 1, 8);
  assert.deepEqual(page1.items, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.from, 1);
  assert.equal(page1.to, 8);
  const page3 = pageSlice(items, 3, 8);
  assert.deepEqual(page3.items, [17, 18, 19, 20, 21]);
  assert.equal(page3.from, 17);
  assert.equal(page3.to, 21);
});

test('pageSlice clamps out-of-range page', () => {
  const items = [1, 2, 3];
  const over = pageSlice(items, 9, 8);
  assert.equal(over.page, 1);
  assert.deepEqual(over.items, [1, 2, 3]);
});
