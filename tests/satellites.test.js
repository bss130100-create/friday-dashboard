import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseTle, satState, visibleGps, loadTle, renderSatellites } from '../js/satellites.js';
import { ISS_TLE, GPS_TLE } from './fixtures.js';

const BUCHAREST = { lat: 44.43, lon: 26.1 };
const WHEN = new Date('2026-10-24T14:00:00Z');

test('parseTle reads name + 2 lines per satellite', () => {
  const sats = parseTle(GPS_TLE);
  assert.equal(sats.length, 2);
  assert.equal(sats[0].name, 'GPS BIIR-5  (PRN 22)');
});

test('parseTle rejects garbage (e.g. an HTML error page)', () => {
  assert.throws(() => parseTle('<html>blocked</html>'), /Bad TLE/);
});

test('ISS is ~400 km up, moving ~7.66 km/s, inside its 51.6° inclination band', () => {
  const [iss] = parseTle(ISS_TLE);
  const s = satState(iss.satrec, WHEN, BUCHAREST);
  assert.ok(s.altKm > 380 && s.altKm < 450, `alt ${s.altKm}`);
  assert.ok(s.speedKmS > 7.5 && s.speedKmS < 7.8, `speed ${s.speedKmS}`);
  assert.ok(Math.abs(s.lat) <= 51.7, `lat ${s.lat}`);
});

test('GPS satellites orbit at ~20,200 km; visible list is above horizon, highest first', () => {
  const gps = parseTle(GPS_TLE);
  for (const g of gps) {
    const alt = satState(g.satrec, WHEN, BUCHAREST).altKm;
    assert.ok(alt > 19500 && alt < 21000, `alt ${alt}`);
  }
  const visible = visibleGps(gps, WHEN, BUCHAREST);
  for (const v of visible) assert.ok(v.elevation > 0);
  for (let i = 1; i < visible.length; i++) assert.ok(visible[i - 1].elevation >= visible[i].elevation);
});

test('renderSatellites produces a sky plot', () => {
  const [iss] = parseTle(ISS_TLE);
  const html = renderSatellites(satState(iss.satrec, WHEN, BUCHAREST), [], 31);
  assert.match(html, /<svg/);
  assert.match(html, /0\/31 sats/);
});

// --- loadTle caching: fake fetch + fake localStorage
afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.localStorage;
});

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

test('loadTle downloads once, then reuses the saved copy for 2 hours', async () => {
  let downloads = 0;
  globalThis.fetch = async () => { downloads++; return new Response(ISS_TLE); };
  globalThis.localStorage = fakeStorage();
  const t0 = 1_000_000_000_000;
  await loadTle('https://x.test/tle', t0);
  await loadTle('https://x.test/tle', t0 + 60 * 60 * 1000);       // +1 h: cached
  assert.equal(downloads, 1);
  await loadTle('https://x.test/tle', t0 + 2.5 * 60 * 60 * 1000); // +2.5 h: stale
  assert.equal(downloads, 2);
});

test('loadTle surfaces HTTP errors (e.g. CelesTrak rate-limit 403)', async () => {
  globalThis.fetch = async () => new Response('blocked', { status: 403 });
  globalThis.localStorage = fakeStorage();
  await assert.rejects(loadTle('https://celestrak.org/x'), /HTTP 403 from celestrak.org/);
});
