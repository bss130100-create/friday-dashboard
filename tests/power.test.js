import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { power } from '../relay/worker.js';
import { brusselsClock, ratePeriod, nextSwitch, parseRenewables, greenestWindow, renderPower } from '../js/power.js';
import { SIGNAL_JSON } from './fixtures.js';

afterEach(() => delete globalThis.fetch);

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isQuery = (sql) => /^\s*SELECT/i.test(sql);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    exec: () => (isQuery(sql) ? { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) } : db.prepare(sql).run(...params)),
    run: async () => stmt(sql, params).exec(),
    all: async () => stmt(sql, params).exec(),
    first: async () => { const row = db.prepare(sql).get(...params); return row ? { ...row } : null; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s.exec()) };
}

const t = (iso) => Date.parse(iso) / 1000;
const POWER = { renewables: { unix_seconds: SIGNAL_JSON.unix_seconds, share: SIGNAL_JSON.share } };
const NO_HOLIDAYS = new Set();

test('Worker /power: renewable forecast relayed, one fetch per 30 min', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    if (url === 'https://api.energy-charts.info/signal?country=be') return Response.json(SIGNAL_JSON);
    throw new Error(`unexpected ${url}`);
  };
  const env = { DB: fakeD1() };
  const t0 = Date.parse('2026-10-25T11:00:00Z');
  assert.deepEqual(await power(env, t0), POWER);
  await power(env, t0 + 29 * 60000);
  assert.equal(asked.length, 1);
  await power(env, t0 + 30 * 60000);
  assert.equal(asked.length, 2);
  const res = await worker.fetch(new Request('https://m.example/power'), env, { waitUntil() {} });
  assert.deepEqual(await res.json(), POWER);
});

test('Worker /power: a broken upstream answer is an error, not a blank panel', async () => {
  globalThis.fetch = async () => Response.json({ error: 'x' });
  await assert.rejects(power({ DB: fakeD1() }), /Energy-Charts: unexpected answer/);
});

test('Brussels wall clock, also across the clock change', () => {
  assert.deepEqual(brusselsClock(t('2026-10-26T06:00:00Z')), { date: '2026-10-26', hour: 7, weekday: 'Mon' }); // winter time, UTC+1
  assert.deepEqual(brusselsClock(t('2026-10-23T20:00:00Z')), { date: '2026-10-23', hour: 22, weekday: 'Fri' }); // summer time, UTC+2
});

test('day/night rate: weekdays 07-22 day, nights, weekends and public holidays night', () => {
  assert.equal(ratePeriod(t('2026-10-26T05:59:00Z'), NO_HOLIDAYS), 'night'); // Mon 06:59
  assert.equal(ratePeriod(t('2026-10-26T06:00:00Z'), NO_HOLIDAYS), 'day'); // Mon 07:00
  assert.equal(ratePeriod(t('2026-10-26T20:59:00Z'), NO_HOLIDAYS), 'day'); // Mon 21:59
  assert.equal(ratePeriod(t('2026-10-26T21:00:00Z'), NO_HOLIDAYS), 'night'); // Mon 22:00
  assert.equal(ratePeriod(t('2026-10-25T11:00:00Z'), NO_HOLIDAYS), 'night'); // Sunday noon
  assert.equal(ratePeriod(t('2026-11-11T11:00:00Z'), new Set(['2026-11-11'])), 'night'); // Armistice, a Wednesday
  assert.equal(ratePeriod(t('2026-11-11T11:00:00Z'), NO_HOLIDAYS), 'day');
});

test('next rate change: weekend night rate ends Monday 07:00', () => {
  assert.equal(nextSwitch(t('2026-10-25T11:20:00Z'), NO_HOLIDAYS), t('2026-10-26T06:00:00Z'));
  assert.equal(nextSwitch(t('2026-10-26T10:00:00Z'), NO_HOLIDAYS), t('2026-10-26T21:00:00Z'));
});

test('renewables: past hours dropped, greenest 3 h skips gaps', () => {
  const now = new Date('2026-10-24T23:30:00Z'); // the forecast's second hour
  const list = parseRenewables(POWER, now);
  assert.equal(list.length, 5);
  assert.deepEqual(greenestWindow(list), { from: 1792922400, to: 1792922400 + 3 * 3600, avg: (104.1 + 99.8 + 95.1) / 3 });
  assert.equal(greenestWindow(list.slice(0, 2)), null);
  assert.throws(() => parseRenewables({}, now), /unexpected answer/);
  assert.throws(() => parseRenewables(POWER, new Date('2026-10-26T00:00:00Z')), /No renewable forecast/);
});

test('panel: rate now, next change, greenest window, chart labels', () => {
  const now = t('2026-10-25T10:20:00Z'); // Sunday 11:20 (winter time since 03:00)
  const hours = parseRenewables(POWER, new Date(now * 1000));
  const html = renderPower({ now, hours, holidays: NO_HOLIDAYS });
  assert.match(html, /<div class="big">NIGHT<span class="unit"> rate<\/span><\/div>/);
  assert.match(html, /cheap rate now · day rate from Mon 07:00/);
  assert.match(html, /Greenest 3 h<\/td><td><span class="nowrap">Sun 11:00–14:00<\/span> · 100% · <span class="nowrap">night rate too<\/span>/);
  assert.match(html, /<title>Sun 11:00 · night rate: 104% renewable<\/title>/);
});
