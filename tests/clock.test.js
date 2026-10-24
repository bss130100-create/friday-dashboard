import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gpsTime, GPS_EPOCH_MS, renderClock } from '../js/clock.js';

test('GPS week 0 starts at the GPS epoch', () => {
  const utcAtGpsEpoch = new Date(GPS_EPOCH_MS); // leap seconds were 0 in 1980; formula still adds today's 18
  const g = gpsTime(utcAtGpsEpoch);
  assert.equal(g.week, 0);
  assert.equal(g.timeOfWeek, 18);
});

test('2019-04-07 is GPS week 2048: the 10-bit week counter rolled over to 0', () => {
  const utc = new Date(Date.UTC(2019, 3, 7) - 18 * 1000); // 18 s before midnight UTC = midnight GPS
  const g = gpsTime(utc);
  assert.equal(g.week, 2048);
  assert.equal(g.week10bit, 0);
  assert.equal(g.timeOfWeek, 0);
});

test('GPS clock reads 18 s ahead of UTC', () => {
  const utc = new Date('2026-10-24T14:00:00Z');
  assert.equal(gpsTime(utc).gpsDate.toISOString(), '2026-10-24T14:00:18.000Z');
});

test('renderClock shows UTC and GPS rows', () => {
  const html = renderClock(new Date('2026-10-24T14:00:00Z'));
  assert.match(html, /14:00:00/);
  assert.match(html, /14:00:18/);
});
