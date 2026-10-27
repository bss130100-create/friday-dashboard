import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { historyUrl, weekChange, dailySeries, topSeries, renderGnssHistory, renderAttackHistory, renderHistory } from '../js/history.js';
import { lineChart, barChart } from '../js/charts.js';

const days = (n, start = '2026-09-01') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
afterEach(() => delete globalThis.fetch);

test('history url: kind and days only, never your position', () => {
  assert.equal(historyUrl('gnss', 90), '/history?kind=gnss&days=90');
});

test('week-over-week change', () => {
  assert.equal(weekChange([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]), 100);
  assert.equal(weekChange([1, 2, 3]), null); // under 2 weeks
  assert.equal(weekChange(Array(14).fill(0)), null); // nothing to compare against
});

test('missing days count as 0', () => {
  const s = dailySeries([{ date: '2026-10-01', n: 3 }, { date: '2026-10-03', n: 5 }], '2026-10-01', '2026-10-03', (r) => r.n);
  assert.deepEqual(s, [{ label: '2026-10-01', value: 3 }, { label: '2026-10-02', value: 0 }, { label: '2026-10-03', value: 5 }]);
});

test('top series: ranked by the last 7 days, quiet groups dropped', () => {
  const rows = days(10).flatMap((date, i) => [
    { date, zone: 'Baltic', high: 10 },
    { date, zone: 'Black Sea', high: i > 5 ? 50 : 0 },
    { date, zone: 'Quiet', high: 0 },
  ]);
  const top = topSeries(rows, 'zone', (r) => r.high, 4);
  assert.deepEqual(top.map((g) => g.name), ['Black Sea', 'Baltic']);
  assert.equal(top[0].series.length, 10);
});

test('charts: a line needs 2 points; every day has a hover title', () => {
  assert.match(lineChart([{ label: 'a', value: 1 }]), /collecting/);
  const svg = lineChart([{ label: '2026-10-01', value: 3 }, { label: '2026-10-02', value: 5 }], { unit: '%' });
  assert.equal((svg.match(/<title>/g) ?? []).length, 2);
  assert.match(svg, /<title>2026-10-02: 5%<\/title>/);
  assert.equal((barChart([{ label: 'd', value: 2 }, { label: 'e', value: 0 }]).match(/class="col"/g) ?? []).length, 2);
});

test('views render, and say so when the memory is still empty', () => {
  assert.match(renderGnssHistory({ days: [] }), /No GNSS history yet/);
  const gnss = { days: days(20).map((date, i) => ({ date, zone: 'Baltic / Kaliningrad', high: i < 13 ? 10 : 20, medium: 1 })) };
  assert.match(renderGnssHistory(gnss), /Baltic \/ Kaliningrad[\s\S]*\+100% vs prev\. week/);
  const attacks = { days: days(3, '2026-10-22').flatMap((date) => [{ date, origin: 'CN', name: 'China', pct: 14.2 }]) };
  assert.match(renderAttackHistory(attacks), /China \(CN\)[\s\S]*14\.2%/);
});

test('renderHistory asks the Worker for both, one after another', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(new URLSearchParams(url.split('?')[1]).get('kind'));
    return Response.json({ days: [] });
  };
  const html = await renderHistory();
  assert.deepEqual(asked, ['gnss', 'attacks']);
  assert.match(html, /GNSS JAMMING TREND[\s\S]*ATTACK ORIGINS TREND/);
  assert.doesNotMatch(html, /EARTHQUAKE/);
});
