import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowSpan, PANEL_GAP_PX } from '../js/masonry.js';

test('masonry: a panel spans its height plus the gap, in 1px rows', () => {
  assert.equal(PANEL_GAP_PX, 14);
  assert.equal(rowSpan(286), 300);
  assert.equal(rowSpan(286.4), 301); // part pixels round up, so panels never overlap
  assert.equal(rowSpan(0), 14); // empty still keeps the gap
});
