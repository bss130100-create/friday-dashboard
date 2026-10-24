import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, bearingDeg, compassPoint } from '../js/geo.js';

test('Bucharest to Paris is about 1870 km', () => {
  const d = distanceKm(44.4268, 26.1025, 48.8566, 2.3522);
  assert.ok(Math.abs(d - 1870) < 20, `got ${d}`);
});

test('bearing: straight north is 0, along the equator east is 90', () => {
  assert.ok(Math.abs(bearingDeg(0, 0, 10, 0) - 0) < 1e-9);
  assert.ok(Math.abs(bearingDeg(0, 0, 0, 10) - 90) < 1e-9);
});

test('compass points', () => {
  assert.equal(compassPoint(0), 'N');
  assert.equal(compassPoint(350), 'N');
  assert.equal(compassPoint(225), 'SW');
});
