import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { power, brusselsDate } from '../relay/worker.js';
import { parsePower, cheapestWindow, renderPower } from '../js/power.js';
import { PRICE_JSON, SIGNAL_JSON } from './fixtures.js';

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

const START = new Date(1792879200 * 1000); // 2026-10-25 00:00 in Brussels (summer time)
const POWER = {
  price: { unix_seconds: PRICE_JSON.unix_seconds, price: PRICE_JSON.price },
  renewables: { unix_seconds: SIGNAL_JSON.unix_seconds, share: SIGNAL_JSON.share },
};
const hour = (t, price, share = 50) => ({ t, price, share });

test('Worker /power: today and tomorrow in Brussels dates, one fetch per 30 min', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    if (url.includes('/price?')) return Response.json(PRICE_JSON);
    if (url.includes('/signal?')) return Response.json(SIGNAL_JSON);
    throw new Error(`unexpected ${url}`);
  };
  const env = { DB: fakeD1() };
  const t0 = Date.parse('2026-10-25T22:30:00Z'); // 23:30 in Brussels, after the clocks went back
  assert.equal(brusselsDate(t0), '2026-10-25');
  assert.deepEqual(await power(env, t0), POWER);
  assert.match(asked[0], /bzn=BE&start=2026-10-25&end=2026-10-26$/);
  assert.match(asked[1], /signal\?country=be$/);
  await power(env, t0 + 29 * 60000);
  assert.equal(asked.length, 2);
  const res = await worker.fetch(new Request('https://m.example/power'), env, { waitUntil() {} });
  assert.deepEqual(await res.json(), POWER);
});

test('Worker /power: a broken upstream answer is an error, not a blank panel', async () => {
  globalThis.fetch = async () => Response.json({ error: 'x' });
  await assert.rejects(power({ DB: fakeD1() }, START.getTime()), /Energy-Charts: unexpected answer/);
});

test('quarter-hours -> hours in c€/kWh, past hours dropped', () => {
  const list = parsePower(POWER, START);
  assert.equal(list.length, 2);
  assert.equal(list[0].price.toFixed(4), ((13.05 + 12.63 + 8.16 + 7.01) / 4 / 10).toFixed(4));
  assert.equal(list[1].share, 61.6);
  assert.equal(parsePower(POWER, new Date(START.getTime() + 3600e3)).length, 1);
  assert.throws(() => parsePower(POWER, new Date(START.getTime() + 2 * 3600e3)), /No electricity prices/);
  assert.throws(() => parsePower({}, START), /unexpected answer/);
});

test('cheapest 3-hour window skips gaps', () => {
  const H = 3600;
  const list = [hour(0, 9), hour(H, 1), hour(2 * H, 2), hour(3 * H, 3), hour(5 * H, -5), hour(6 * H, -5)];
  assert.deepEqual(cheapestWindow(list), { from: H, to: 4 * H, avg: 2 }); // 3H..6H would be cheaper, but 4H is missing
  assert.equal(cheapestWindow(list.slice(0, 2)), null);
});

test('panel: price now, cheapest window and chart in Brussels time', () => {
  const H = 3600;
  const t = 1792879200;
  const html = renderPower([hour(t, 1.2, 60), hour(t + H, -0.1, 100), hour(t + 2 * H, 0.4, 80), hour(t + 3 * H, 9.5, 40)]);
  assert.match(html, /<div class="big">1\.2<span class="unit"> c€\/kWh/);
  // 25 Oct 2026 the clocks go back at 03:00: three hours from 00:00 summer time end at 02:00 winter time
  assert.match(html, /Cheapest 3 h<\/td><td class="nowrap">Sun 00:00–02:00<\/td><td class="nowrap">0\.5 c€\/kWh/);
  assert.match(html, /Priciest<\/td><td class="nowrap">Sun 02:00<\/td><td class="hot nowrap">9\.5 c€\/kWh/); // the second 02:00: clocks go back
  assert.match(html, /<title>Sun 00:00 · 1\.2 c€\/kWh: 60% renewable<\/title>/);
});
