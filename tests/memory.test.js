// MIAP memory: the Worker's hourly snapshot + /history, run against a real SQLite database
// (node:sqlite) wrapped to look like Cloudflare D1.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, {
  quakeRows, gnssRows, attackRows, snapshot, history, historyQuery, verifyLogin, settings,
  roadsQuery, roadsBox, parseIncidents, roads, briefingMessages, briefing,
} from '../relay/worker.js';
import { USGS_JSON, RADAR_JSON } from './fixtures.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isQuery = (sql) => /^\s*SELECT/i.test(sql);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    exec: () => (isQuery(sql) ? { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) } : db.prepare(sql).run(...params)),
    run: async () => stmt(sql, params).exec(),
    all: async () => stmt(sql, params).exec(),
    first: async () => { const row = db.prepare(sql).get(...params); return row ? { ...row } : null; }, // D1: null when no row
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s.exec()) };
}

const GPSJAM = { date: '2026-10-23', regions: [{ name: 'Baltic / Kaliningrad', high: 40, medium: 12 }, { name: 'Elsewhere', high: 0, medium: 3 }], cells: [] };
const BACKFILL = [['2026-09-01', 'Baltic / Kaliningrad', 25, 9], ['2026-10-23', 'Baltic / Kaliningrad', 1, 1]];
const NOW = new Date('2026-10-24T10:00:00Z');

// The site's own files come from the ASSETS binding, everything else from the internet.
const ASSETS = {
  fetch: async (req) => {
    const path = new URL(req.url).pathname;
    if (path === '/data/gpsjam.json') return Response.json(GPSJAM);
    if (path === '/data/gnss-backfill.json') return Response.json(BACKFILL);
    return new Response('not found', { status: 404 });
  },
};

function fakeFetch({ failRadar = false } = {}) {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(url);
    if (url.includes('usgs.gov')) return Response.json(USGS_JSON);
    if (url.includes('/radar/')) {
      assert.equal(init.headers.Authorization, 'Bearer tok');
      return failRadar ? new Response('nope', { status: 401 }) : Response.json(RADAR_JSON);
    }
    throw new Error(`unexpected ${url}`);
  };
  return asked;
}
afterEach(() => delete globalThis.fetch);

test('API answers -> table rows', () => {
  const q = quakeRows({ features: [{ id: 'us1', properties: { time: 1, mag: 4.7, place: 'X' }, geometry: { coordinates: [121, 20, 35] } }] });
  assert.deepEqual(q, [['us1', 1, 4.7, 'X', 20, 121, 35]]);
  assert.deepEqual(gnssRows(GPSJAM)[0], ['2026-10-23', 'Baltic / Kaliningrad', 40, 12]);
  assert.deepEqual(attackRows(RADAR_JSON, '2026-10-24')[0].slice(0, 2), ['2026-10-24', 'US']);
  assert.throws(() => quakeRows({}), /USGS/);
  assert.throws(() => gnssRows({ date: 'x' }), /regions/);
  assert.throws(() => attackRows({ success: false }, 'x'), /Radar/);
});

test('snapshot fills all three tables; running it again does not duplicate', async () => {
  fakeFetch();
  const env = { DB: fakeD1(), ASSETS, RADAR_TOKEN: 'tok' };
  await snapshot(env, NOW);
  await snapshot(env, NOW);
  const q = await history(env, { kind: 'quakes', days: 30 }, NOW);
  assert.equal(q.days.reduce((s, d) => s + d.n, 0), USGS_JSON.features.length);
  assert.equal(q.biggest30d[0].mag, 4.7);
  const near = await history(env, { kind: 'quakes', days: 30, near: { lat: 44.43, lon: 26.1 } }, NOW); // Bucharest
  assert.match(near.nearest365d.place, /Vrancea/);
  const g = await history(env, { kind: 'gnss', days: 90 }, NOW);
  // backfill ran (fewer than 30 days stored) but never overwrote a real snapshot
  assert.deepEqual(g.days.filter((d) => d.zone === 'Baltic / Kaliningrad').map((d) => [d.date, d.high]), [['2026-09-01', 25], ['2026-10-23', 40]]);
  const a = await history(env, { kind: 'attacks', days: 7 }, NOW);
  assert.equal(a.days.length, new Set(RADAR_JSON.result.top_0.map((r) => r.originCountryAlpha2)).size);
  assert.equal(a.days[0].date, '2026-10-24');
});

test('a failing source is reported, the others are still saved', async () => {
  fakeFetch({ failRadar: true });
  const env = { DB: fakeD1(), ASSETS, RADAR_TOKEN: 'tok' };
  await assert.rejects(snapshot(env, NOW), /attacks: HTTP 401 from api\.cloudflare\.com/);
  assert.ok((await history(env, { kind: 'quakes', days: 30 }, NOW)).days.length > 0);
});

test('/history validates input and explains a missing database', async () => {
  assert.deepEqual(historyQuery('https://r.example/history?kind=gnss&days=30'), { kind: 'gnss', days: 30 });
  assert.throws(() => historyQuery('https://r.example/history?kind=cves'), /kind must be/);
  assert.throws(() => historyQuery('https://r.example/history?kind=gnss&days=9999'), /days must be/);
  assert.deepEqual(historyQuery('https://r.example/history?kind=quakes&lat=50.8&lon=4.3').near, { lat: 50.8, lon: 4.3 });
  assert.throws(() => historyQuery('https://r.example/history?kind=quakes&lat=99&lon=4'), /out of range/);
  const res = await worker.fetch(new Request('https://r.example/history?kind=gnss'), {});
  assert.equal(res.status, 400);
  assert.match(await res.text(), /D1 database is not bound/);
});

test('snapshot explains missing static assets instead of failing silently', async () => {
  fakeFetch();
  await assert.rejects(snapshot({ DB: fakeD1(), RADAR_TOKEN: 'tok' }, NOW), /gnss: static assets are not bound/);
});

// --- settings: only through a valid Access login token
const TEAM = 'https://falling-king-09ce.cloudflareaccess.com';
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

async function accessKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  const sign = async (claims) => {
    const head = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
    const body = b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
  };
  return { getKeys: async () => ({ keys: [jwk] }), sign };
}

test('verifyLogin accepts only a valid, unexpired token from our Access team', async () => {
  const { getKeys, sign } = await accessKeys();
  const other = await accessKeys();
  const now = Date.parse('2026-10-24T17:00:00Z');
  const req = (token) => new Request('https://m.example/settings/commute', token ? { headers: { 'Cf-Access-Jwt-Assertion': token } } : {});
  const good = { iss: TEAM, exp: now / 1000 + 3600, email: 'me@example.com' };
  await verifyLogin(req(await sign(good)), now, getKeys);
  await assert.rejects(verifyLogin(req(null), now, getKeys), /no Access login/);
  await assert.rejects(verifyLogin(req('a.b.c'), now, getKeys), /malformed/);
  await assert.rejects(verifyLogin(req('only-one-part'), now, getKeys), /malformed/);
  await assert.rejects(verifyLogin(req(await sign({ ...good, exp: now / 1000 - 1 })), now, getKeys), /expired/);
  await assert.rejects(verifyLogin(req(await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' })), now, getKeys), /wrong team/);
  await assert.rejects(verifyLogin(req(await other.sign(good)), now, getKeys), /signature is invalid/);
  const [h, , s] = (await sign(good)).split('.');
  await assert.rejects(verifyLogin(req(`${h}.${b64url(JSON.stringify({ ...good, email: 'x@y' }))}.${s}`), now, getKeys), /signature is invalid/);
});

test('settings: null until saved, then the saved object; bad input refused', async () => {
  const env = { DB: fakeD1() };
  const put = (body) => new Request('https://m.example/settings/commute', { method: 'PUT', body });
  assert.equal(await settings(env, new Request('https://m.example/settings/commute')), null);
  await settings(env, put('{"home":{"name":"H","lat":1,"lon":2}}'));
  assert.deepEqual(await settings(env, new Request('https://m.example/settings/commute')), { home: { name: 'H', lat: 1, lon: 2 } });
  await assert.rejects(settings(env, put('[1]')), /JSON object/);
  await assert.rejects(settings(env, put('x'.repeat(5000))), /too big/);
  await assert.rejects(settings(env, new Request('https://m.example/settings/commute', { method: 'DELETE' })), /not allowed/);
});

test('/settings/commute without a login is refused with 403', async () => {
  const res = await worker.fetch(new Request('https://m.example/settings/commute'), { DB: fakeD1() });
  assert.equal(res.status, 403);
  assert.match(await res.text(), /no Access login/);
});

// --- roads (TomTom) and briefing (Workers AI)
const TOMTOM = { incidents: [
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.43, 50.92], [4.44, 50.93]] },
    properties: { iconCategory: 'jam', magnitudeOfDelay: 'major', events: [{ description: 'Stationary traffic' }], from: 'Vilvoorde', to: 'Machelen', lengthInMeters: 3400, delayInSeconds: 840, roadNumbers: ['E19'] } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [4.3, 50.79] },
    properties: { iconCategory: 'roadClosed', magnitudeOfDelay: 'undefined', events: [{ description: 'Closed' }], from: 'Ruisbroek', to: 'Drogenbos', lengthInMeters: 1200, roadNumbers: ['R0'] } },
] };

test('roads: position snapped to a ~20 km cell, box under 10,000 km², closures first', () => {
  assert.deepEqual(roadsQuery('https://m.example/roads?lat=50.8466&lon=4.3528'), { lat: 50.8, lon: 4.4 });
  assert.throws(() => roadsQuery('https://m.example/roads'), /lat\/lon/);
  assert.equal(roadsBox({ lat: 50.8, lon: 4.4 }), '3.850,50.450,4.950,51.150');
  const list = parseIncidents(TOMTOM);
  assert.deepEqual(list.map((i) => [i.kind, i.delayMin, i.km, i.lat]), [['roadClosed', 0, 1.2, 50.79], ['jam', 14, 3.4, 50.92]]);
  assert.throws(() => parseIncidents({}), /no incidents/);
});

test('roads: asks TomTom once, then serves the cache for 30 min; no key is a clear error', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(url, /^https:\/\/api\.tomtom\.com\/maps\/orbis\/traffic\/incidents\/details\?apiVersion=2&bbox=3\.850%2C50\.450/);
    assert.equal(init.headers['TomTom-Api-Key'], 'k');
    return Response.json(TOMTOM);
  };
  const env = { DB: fakeD1(), TOMTOM_KEY: 'k' };
  const cell = { lat: 50.8, lon: 4.4 };
  const t0 = Date.parse('2026-10-24T17:00:00Z');
  assert.equal((await roads(env, cell, t0)).incidents.length, 2);
  await roads(env, cell, t0 + 29 * 60000);
  assert.equal(calls, 1);
  await roads(env, cell, t0 + 31 * 60000);
  assert.equal(calls, 2);
  await assert.rejects(roads({ DB: fakeD1() }, cell, t0), /TOMTOM_KEY secret is not set/);
});

test('briefing: panels go to the model as readouts; bad input and missing AI are explained', async () => {
  const body = { now: 'Saturday 19:30', panels: { Weather: '12 °C light rain' } };
  const [system, user] = briefingMessages(body);
  assert.match(system.content, /at most 3 short sentences/);
  assert.match(system.content, /Never mention work or the commute to work on a Saturday or Sunday/);
  assert.equal(user.content, 'Local time: Saturday 19:30\n[Weather] 12 °C light rain');
  assert.throws(() => briefingMessages({ panels: {} }), /needs \{ now, panels \}/);
  assert.throws(() => briefingMessages({ now: 'x', panels: { a: 'y'.repeat(7000) } }), /too long/);
  const post = () => new Request('https://m.example/briefing', { method: 'POST', body: JSON.stringify(body) });
  let asked;
  const env = { AI: { run: async (model, input) => { asked = { model, input }; return { response: ' Rain: take a coat. ' }; } } };
  assert.deepEqual(await briefing(env, post()), { text: 'Rain: take a coat.' });
  assert.equal(asked.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(asked.input.max_tokens, 160);
  await assert.rejects(briefing({}, post()), /Workers AI is not bound/);
  await assert.rejects(briefing({ AI: { run: async () => ({}) } }, post()), /no text/);
  const res = await worker.fetch(new Request('https://m.example/briefing'), env);
  assert.equal(res.status, 400);
});
