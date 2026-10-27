// System tab: the Worker's Cloudflare analytics (3 GraphQL requests, cached 10 min), its own records
// of error answers and scheduled runs, the 30-day wipe, and the panel.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { GRAPHQL_URL, SCRIPT, D1_DATABASE_ID, usageQueries, parseWorkers, parseAi, parseD1 } from '../relay/usage.js';
import worker, { cloudflareUsage, recordError, recordRun, ownHealth, systemStatus, prune, snapshot } from '../relay/worker.js';
import { renderSystem, renderPruned, meter, ring, chartBlock, PRUNE_QUESTION } from '../js/system.js';

afterEach(() => delete globalThis.fetch);

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isQuery = (sql) => /^\s*SELECT/i.test(sql);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    exec: () => (isQuery(sql) ? { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) } : { meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
    run: async () => stmt(sql, params).exec(),
    all: async () => stmt(sql, params).exec(),
    first: async () => { const row = db.prepare(sql).get(...params); return row ? { ...row } : null; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s.exec()) };
}

const NOW = Date.parse('2026-10-25T11:00:00Z');
const ENV = { CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: 'acc' };
const acct = (a) => ({ data: { viewer: { accounts: [a] } }, errors: null });
// Shapes of Cloudflare's answers (values made up); CPU time in microseconds.
const WORKERS = acct({
  today: [{ sum: { requests: 900 } }],
  total: [{ sum: { requests: 1200, errors: 6, subrequests: 300 }, quantiles: { cpuTimeP50: 2100, cpuTimeP99: 8450 } }],
  hourly: [
    { sum: { requests: 50, errors: 0 }, quantiles: { cpuTimeP99: 4000 }, dimensions: { datetimeHour: '2026-10-25T09:00:00Z' } },
    { sum: { requests: 70, errors: 6 }, quantiles: { cpuTimeP99: 12500 }, dimensions: { datetimeHour: '2026-10-25T10:00:00Z' } },
  ],
  outcomes: [{ sum: { requests: 1194 }, dimensions: { status: 'success' } }, { sum: { requests: 6 }, dimensions: { status: 'scriptThrewException' } }],
});
const AI = acct({ today: [{ sum: { totalNeurons: 412.6 } }] });
const D1 = acct({ today: [{ sum: { readQueries: 500, writeQueries: 80, rowsRead: 12000, rowsWritten: 950 } }], size: [{ max: { databaseSizeBytes: 3500000 }, dimensions: { date: '2026-10-25' } }] });

function fakeCloudflare({ aiBroken = false } = {}) {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, GRAPHQL_URL);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const { query } = JSON.parse(init.body);
    asked.push(query);
    if (query.includes('workersInvocationsAdaptive')) return Response.json(WORKERS);
    if (query.includes('aiInferenceAdaptiveGroups')) return Response.json(aiBroken ? { data: null, errors: [{ message: 'unknown field totalNeurons' }] } : AI);
    if (query.includes('d1AnalyticsAdaptiveGroups')) return Response.json(D1);
    throw new Error('unexpected query');
  };
  return asked;
}

test('queries: our Worker and database, today from 00:00 UTC, charts over 24 h; secrets required', () => {
  const q = usageQueries(ENV, NOW);
  assert.deepEqual(q.workers.variables, { account: 'acc', script: SCRIPT, from: '2026-10-24T11:00:00.000Z', dayStart: '2026-10-25T00:00:00Z', to: '2026-10-25T11:00:00.000Z' });
  assert.deepEqual(q.ai.variables, { account: 'acc', dayStart: '2026-10-25T00:00:00Z', to: '2026-10-25T11:00:00.000Z' });
  assert.deepEqual(q.d1.variables, { account: 'acc', db: D1_DATABASE_ID, today: '2026-10-25', weekAgo: '2026-10-18' });
  for (const { query, variables } of Object.values(q)) {
    for (const v of Object.keys(variables)) assert.match(query, new RegExp(`\\$${v}\\b[^]*\\$${v}\\b`), `$${v} declared and used`);
  }
  assert.throws(() => usageQueries({ CF_ACCOUNT_ID: 'acc' }, NOW), /CF_API_TOKEN secret is not set/);
  assert.throws(() => usageQueries({ CF_API_TOKEN: 'tok' }, NOW), /CF_ACCOUNT_ID secret is not set/);
});

test('answers: CPU in ms, neurons rounded, D1 rows and size; GraphQL errors fail loudly', () => {
  const w = parseWorkers(WORKERS);
  assert.deepEqual([w.requestsToday, w.requests, w.errors, w.subrequests, w.cpuP50Ms, w.cpuP99Ms], [900, 1200, 6, 300, 2.1, 8.45]);
  assert.deepEqual(w.hours[1], { hour: '2026-10-25T10:00:00Z', requests: 70, errors: 6, cpuP99Ms: 12.5 });
  assert.deepEqual(parseAi(AI), { neuronsToday: 413 });
  assert.deepEqual(parseD1(D1), { rowsReadToday: 12000, rowsWrittenToday: 950, queriesToday: 580, sizeBytes: 3500000 });
  assert.throws(() => parseAi({ data: null, errors: [{ message: 'not authorized' }] }), /Cloudflare analytics: not authorized/);
  assert.throws(() => parseD1(acct(undefined)), /account not found/);
});

test('Cloudflare asked at most every 10 min; one broken part leaves the others', async () => {
  const asked = fakeCloudflare({ aiBroken: true });
  const env = { ...ENV, DB: fakeD1() };
  const u = await cloudflareUsage(env, NOW);
  assert.equal(u.workers.requestsToday, 900);
  assert.equal(u.d1.rowsWrittenToday, 950);
  assert.deepEqual(u.ai, { error: 'Cloudflare analytics: unknown field totalNeurons' });
  await cloudflareUsage(env, NOW + 9 * 60000);
  assert.equal(asked.length, 3);
  await cloudflareUsage(env, NOW + 10 * 60000);
  assert.equal(asked.length, 6);
});

test('own records: errors per path and hour, scheduled runs with the latest per job', async () => {
  const env = { DB: fakeD1() };
  await recordError(env, '/roads', 500, 'HTTP 504 from api.tomtom.com', NOW - 2 * 3600000);
  await recordError(env, '/roads', 500, 'HTTP 502 from api.tomtom.com', NOW - 3600000);
  await recordError(env, '/news', 502, 'upstream failed', NOW - 25 * 3600000); // older than 24 h
  await recordRun(env, '0 * * * *', NOW - 2 * 3600000, 800, null);
  await recordRun(env, '0 * * * *', NOW - 3600000, 950, new Error('snapshot failed: attacks: HTTP 401'));
  await recordRun(env, '*/5 * * * *', NOW - 300000, 40, null);
  await recordRun(env, '*/5 * * * *', NOW - 8 * 24 * 3600000, 40, null); // dropped: older than 7 days
  const h = await ownHealth(env, NOW);
  assert.deepEqual(h.errorsByPath, [{ path: '/roads', status: 500, count: 2, hour: '2026-10-25T10', last_error: 'HTTP 502 from api.tomtom.com' }]);
  const hourly = h.crons.find((c) => c.cron === '0 * * * *');
  assert.deepEqual([hourly.runs, hourly.failed, hourly.avg_ms, hourly.last.ok, hourly.last.error], [2, 1, 875, 0, 'snapshot failed: attacks: HTTP 401']);
  assert.equal(h.crons.find((c) => c.cron === '*/5 * * * *').runs, 1);
});

test('a scheduled run is recorded even when it fails, and the failure is still thrown', async () => {
  const env = { DB: fakeD1() }; // no ASSETS, no tokens: the hourly snapshot fails
  globalThis.fetch = async () => new Response('down', { status: 503 });
  await assert.rejects(worker.scheduled({ cron: '0 * * * *', scheduledTime: NOW }, env), /snapshot failed/);
  const { crons } = await ownHealth(env, Date.now());
  assert.equal(crons[0].last.ok, 0);
  assert.match(crons[0].last.error, /snapshot failed/);
});

test('/system needs the login; the wipe needs POST and the login', async () => {
  const ctx = { waitUntil: () => {} };
  const env = { ...ENV, DB: fakeD1() };
  assert.equal((await worker.fetch(new Request('https://m.example/system'), env, ctx)).status, 403);
  assert.equal((await worker.fetch(new Request('https://m.example/system/prune'), env, ctx)).status, 400);
  const res = await worker.fetch(new Request('https://m.example/system/prune', { method: 'POST' }), env, ctx);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /no Access login/);
});

test('system status: each half fails on its own', async () => {
  fakeCloudflare();
  const s = await systemStatus({ DB: fakeD1() }, NOW); // no Cloudflare secrets
  assert.match(s.cloudflare.error, /CF_API_TOKEN secret is not set/);
  assert.deepEqual(s.own, { errorsByPath: [], crons: [] });
});

test('wipe: only what is older than 30 days goes; the GNSS backfill does not bring it back', async () => {
  const env = { DB: fakeD1(), ASSETS: {
    fetch: async (req) => (new URL(req.url).pathname === '/data/gpsjam.json'
      ? Response.json({ date: '2026-10-24', regions: [{ name: 'Baltic / Kaliningrad', high: 40, medium: 12 }], cells: [] })
      : Response.json([['2026-07-01', 'Baltic / Kaliningrad', 9, 9]])),
  } };
  await assert.rejects(snapshot(env, new Date(NOW)), /attacks: RADAR_TOKEN secret is not set/); // no Radar: only GNSS saved (first run: backfill + today)
  const db = env.DB;
  assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'quakes'").first(), null); // earthquakes are gone for good
  await db.prepare("INSERT INTO settings VALUES ('commute', '{}')").run();
  await recordError(env, '/roads', 500, 'old', NOW - 31 * 86400000);
  const result = await prune(env, NOW);
  assert.equal(result.before, '2026-09-25');
  assert.deepEqual(result.deleted, { gnss_daily: 1, attacks_daily: 0, route_errors: 1, cron_runs: 0, cache: 0 });
  await assert.rejects(snapshot(env, new Date(NOW + 3600000)), /attacks: RADAR_TOKEN/); // next hour
  const { results } = await db.prepare('SELECT date FROM gnss_daily').all();
  assert.deepEqual(results, [{ date: '2026-10-24' }]);
  assert.ok(await db.prepare("SELECT 1 FROM settings WHERE key = 'commute'").first());
  assert.equal(renderPruned(result), 'Deleted 2 rows from before 2026-09-25 (gnss_daily 1, route_errors 1).');
  assert.match(PRUNE_QUESTION, /only go back 30 days[^]*cannot be undone/);
});

test('panel: meters against the free limits, failures in red, jobs and paths listed', () => {
  assert.match(meter('X', 95, 100), /ring hot[^]*stroke-dasharray="95 100"[^]*95 \/ 100 · 95%/);
  const html = renderSystem({
    cloudflare: { workers: parseWorkers(WORKERS), ai: { error: 'Cloudflare analytics: unknown field totalNeurons' }, d1: parseD1(D1) },
    own: {
      errorsByPath: [{ path: '/roads', status: 500, count: 2, last_error: 'HTTP 502 from api.tomtom.com' }],
      crons: [{ cron: '0 * * * *', runs: 24, failed: 1, avg_ms: 875, last: { started: NOW - 20 * 60000, ms: 950, ok: 0, error: 'snapshot failed' } }],
    },
  }, NOW);
  assert.match(html, /Worker requests today[^]*900 \/ 100,000 · 0\.9%/);
  assert.match(html, /kpi hot">6<\/span><span class="dim">crashes in 24 h, out of 1,200 requests/);
  assert.match(html, /kpi">2\.1 ms<\/span><span class="dim">typical/);
  assert.match(html, /kpi warm">8\.45 ms<\/span><span class="dim">slowest 1% \(free limit 10 ms\)/);
  assert.match(html, /Crashes per hour[^]*this hour <b>6<\/b> · busiest <b>6<\/b> at 11:00 · <b>6<\/b> in 24 h/); // 10:00Z = 11:00 Brussels
  assert.match(html, /<td>crashed \(code error\)<\/td><td class="hot">6/);
  assert.match(html, /ERROR: Workers AI analytics: Cloudflare analytics: unknown field/);
  assert.match(html, /Database size \(total\)[^]*3\.5 MB \/ 5\.0 GB/);
  assert.match(html, /Database rows written today[^]*950 \/ 100,000/);
  assert.match(html, /\/roads<\/td><td class="hot">500&nbsp;×&nbsp;2/);
  assert.match(html, /FAILED<\/span> Hourly snapshot: last 20m ago, took 950 ms · 24 runs in 24 h, avg 875 ms · <span class="hot">1 failed/);
  assert.match(renderSystem({ cloudflare: { error: 'CF_API_TOKEN secret is not set' }, own: { errorsByPath: [], crons: [] } }, NOW), /ERROR: CF_API_TOKEN[^]*No error answers[^]*No scheduled runs/);
});

test('chart block: plain meaning, this hour / busiest / total, and the time axis', () => {
  const points = [{ label: '09:00', value: 3 }, { label: '10:00', value: 210 }, { label: '11:00', value: 12 }];
  const html = chartBlock({ title: 'Requests per hour', meaning: 'How often.', points, total: 225 });
  assert.match(html, /Requests per hour<\/p><p class="dim small">How often\.<\/p>/);
  assert.match(html, /this hour <b>12<\/b> · busiest <b>210<\/b> at 10:00 · <b>225<\/b> in 24 h/);
  assert.match(html, /<div class="axis"><span>09:00<\/span><span>10:00<\/span><span>11:00<\/span><\/div>/);
  assert.doesNotMatch(chartBlock({ title: 'CPU', meaning: 'x', points, unit: ' ms', line: true }), /in 24 h/);
  assert.match(chartBlock({ title: 'X', meaning: 'x', points: [] }), /no data yet/);
});

test('ring: arc is the percentage, never empty, never past full', () => {
  assert.match(ring(40), /stroke-dasharray="40 100"/);
  assert.match(ring(0), /stroke-dasharray="1 100"/);
  assert.match(ring(250, 'hot'), /class="ring hot"[^]*stroke-dasharray="100 100"/);
});
