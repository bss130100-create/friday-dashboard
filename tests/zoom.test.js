import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FULL, zoomAt, panBy, clampView, zoomLevel } from '../js/zoom.js';

test('zoom: 2x around the centre halves the window and keeps the centre', () => {
  const v = zoomAt(FULL, 2, 180, 90);
  assert.deepEqual(v, { x: 90, y: 45, w: 180, h: 90 });
  assert.equal(zoomLevel(v), 2);
});

test('zoom: the point under the cursor stays put', () => {
  // Zoom in on Bucharest-ish (map x=206, y=45): its position inside the window must not move.
  const v = zoomAt(FULL, 4, 206, 45);
  assert.ok(Math.abs((206 - v.x) / v.w - 206 / 360) < 1e-9);
  assert.ok(Math.abs((45 - v.y) / v.h - 45 / 180) < 1e-9);
});

test('zoom: limited to 1x..16x and never leaves the map', () => {
  assert.deepEqual(zoomAt(FULL, 0.5, 180, 90), FULL);
  assert.equal(zoomLevel(zoomAt(FULL, 1000, 10, 10)), 16);
  assert.deepEqual(clampView({ x: -50, y: 500, w: 180 }), { x: 0, y: 90, w: 180, h: 90 });
});

test('pan: moves the window, stops at the edges', () => {
  const v = zoomAt(FULL, 2, 180, 90);
  assert.deepEqual(panBy(v, 10, -5), { x: 100, y: 40, w: 180, h: 90 });
  assert.deepEqual(panBy(v, 999, 999), { x: 180, y: 90, w: 180, h: 90 });
  assert.deepEqual(panBy(FULL, 20, 20), FULL); // nothing to pan at 1x
});
