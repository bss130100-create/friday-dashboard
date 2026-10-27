// System status panel: how MIAP itself is doing, from the Worker's /system.
//   Cloudflare (cached 10 min there): requests, errors, CPU time; Workers AI neurons; D1 size and rows.
//   MIAP's own records: which routes answered with errors, and how the scheduled jobs ran.
// Each part fails on its own, so one broken source still shows the rest.
import { fetchJson, sendJson } from './http.js';
import { esc, ago } from './ui.js';
import { barChart, lineChart } from './charts.js';

// Cloudflare free plan, per day (reset 00:00 UTC) unless noted
export const FREE = {
  requests: 100000, // Workers requests
  cpuMs: 10, // Workers CPU time per request
  neurons: 10000, // Workers AI
  rowsRead: 5000000, // D1
  rowsWritten: 100000, // D1
  bytes: 5e9, // D1 storage, total
};
export const KEEP_DAYS = 30;

export const loadSystem = () => fetchJson('/system');
export const pruneOld = () => sendJson('/system/prune', 'POST', {});

const pct = (part, whole) => Math.round((part / whole) * 1000) / 10;
// chart hours in Brussels time, like the rest of MIAP
const hourLabel = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const err = (e) => `<p class="err">ERROR: ${esc(e)}</p>`;
const fmt = (n) => n.toLocaleString('en-GB');
const size = (bytes) => (bytes < 1e9 ? `${(bytes / 1e6).toFixed(1)} MB` : `${(bytes / 1e9).toFixed(1)} GB`);

// Circular indicator: an arc filled to p% of the ring (pathLength 100 makes the dash a percentage).
export function ring(p, cls = '') {
  const filled = Math.max(1, Math.min(100, p));
  return `<svg class="ring ${cls}" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15"/>`
    + `<circle class="arc" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${filled} 100" transform="rotate(-90 18 18)"/></svg>`;
}

// One usage line: a ring against the free limit, the label, the numbers.
export function meter(label, value, limit, show = fmt) {
  const p = pct(value, limit);
  const cls = p >= 90 ? 'hot' : p >= 60 ? 'warm' : '';
  return `<div class="meter">${ring(p, cls)}<span class="dim small">${esc(label)}</span>
    <span class="small ${cls}">${esc(show(value))} / ${esc(show(limit))} · ${p}%</span></div>`;
}

const workersMeter = (w) => (w.error ? err(`Worker analytics: ${w.error}`) : meter('Worker requests today', w.requestsToday, FREE.requests));

// A chart with its numbers: one plain line on what it shows, this hour / busiest hour / 24 h total,
// and times under it (first, middle, last hour).
export function chartBlock({ title, meaning, points, unit = '', total = null, line = false, height }) {
  if (!points.length) return `<p class="chart-title">${esc(title)}</p><p class="dim small">no data yet</p>`;
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const stats = [
    `this hour <b>${fmt(points.at(-1).value)}${unit}</b>`,
    `busiest <b>${fmt(peak.value)}${unit}</b> at ${esc(peak.label)}`,
    total === null ? '' : `<b>${fmt(total)}</b> in 24 h`,
  ].filter(Boolean).join(' · ');
  const chart = line ? lineChart(points, { unit, height }) : barChart(points, { unit, height });
  const ticks = [points[0], points[Math.floor(points.length / 2)], points.at(-1)].map((p) => `<span>${esc(p.label)}</span>`).join('');
  return `<p class="chart-title">${esc(title)}</p><p class="dim small">${meaning}</p><p class="small">${stats}</p>${chart}<div class="axis">${ticks}</div>`;
}

// Cloudflare's names for how a request ended, in plain words
const OUTCOMES = {
  success: 'worked', scriptThrewException: 'crashed (code error)', exceededCpu: 'stopped: used too much CPU',
  exceededMemory: 'stopped: used too much memory', clientDisconnected: 'visitor left before the answer', internalError: 'Cloudflare-side error',
};

function workersDetail(w) {
  if (w.error) return '';
  const cpuClass = w.cpuP99Ms > FREE.cpuMs ? 'hot' : w.cpuP99Ms > FREE.cpuMs / 2 ? 'warm' : '';
  const series = (pick) => w.hours.map((h) => ({ label: hourLabel(h.hour), value: pick(h) }));
  return `<div class="kpis">
      <div><span class="kpi ${w.errors ? 'hot' : ''}">${fmt(w.errors)}</span><span class="dim">crashes in 24 h, out of ${fmt(w.requests)} requests</span></div>
      <div><span class="kpi">${w.cpuP50Ms} ms</span><span class="dim">typical work per request</span></div>
      <div><span class="kpi ${cpuClass}">${w.cpuP99Ms} ms</span><span class="dim">slowest 1% (free limit ${FREE.cpuMs} ms)</span></div>
      <div><span class="kpi">${fmt(w.subrequests)}</span><span class="dim">calls to other services, 24 h</span></div>
    </div>
    ${chartBlock({ title: 'Requests per hour', meaning: 'How often MIAP\'s server was used: page loads, panel refreshes and the background jobs.', points: series((h) => h.requests), total: w.requests })}
    ${chartBlock({ title: 'Crashes per hour', meaning: 'Requests that failed inside the server. 0 is what you want.', points: series((h) => h.errors), total: w.errors, height: 32 })}
    ${chartBlock({ title: 'Slowest requests per hour', meaning: `Work time of the slowest 1% of requests in each hour. The free plan allows ${FREE.cpuMs} ms per request.`, points: series((h) => h.cpuP99Ms), unit: ' ms', line: true })}
    <p class="chart-title">How the requests ended · 24 h</p>
    <table class="small">${w.outcomes.map((o) => `<tr><td>${esc(OUTCOMES[o.status] ?? o.status)}</td><td class="${o.status === 'success' ? '' : 'hot'}">${fmt(o.requests)}</td></tr>`).join('')}</table>`;
}

const renderAi = (a) => (a.error ? err(`Workers AI analytics: ${a.error}`) : meter('Workers AI neurons today', a.neuronsToday, FREE.neurons));

function renderD1(d) {
  if (d.error) return err(`D1 analytics: ${d.error}`);
  const stored = d.sizeBytes === null ? '<p class="dim small">Database size: not reported yet</p>' : meter('Database size (total)', d.sizeBytes, FREE.bytes, size);
  return `${meter('Database rows read today', d.rowsReadToday, FREE.rowsRead)}${meter('Database rows written today', d.rowsWrittenToday, FREE.rowsWritten)}${stored}`;
}

function renderErrors(rows) {
  if (!rows.length) return '<p class="dim small">No error answers in the last 24 h.</p>';
  return `<table class="small">${rows.map((r) => `<tr><td>${esc(r.path)}</td><td class="hot">${r.status}&nbsp;×&nbsp;${r.count}</td><td class="dim">${esc(r.last_error ?? '')}</td></tr>`).join('')}</table>`;
}

const CRON_NAMES = { '0 * * * *': 'Hourly snapshot', '*/5 * * * *': 'Commute alerts (every 5 min)' };

function renderCrons(crons, now) {
  if (!crons.length) return '<p class="dim small">No scheduled runs recorded yet (the first one lands within the hour).</p>';
  return crons.map((c) => {
    const l = c.last;
    const state = l.ok ? '<span class="tag cool">OK</span>' : '<span class="tag hot">FAILED</span>';
    const failed = c.failed ? ` · <span class="hot">${c.failed} failed</span>` : '';
    return `<p class="small">${state} ${esc(CRON_NAMES[c.cron] ?? c.cron)}: last ${ago(l.started, now)}, took ${l.ms} ms · ${c.runs} runs in 24 h, avg ${c.avg_ms} ms${failed}
      ${l.ok ? '' : `<br><span class="err">${esc(l.error)}</span>`}</p>`;
  }).join('');
}

export function renderSystem(s, now) {
  const cf = s.cloudflare;
  // the free-limit meters first, then the Worker's 24 h detail
  const cloud = cf.error ? err(cf.error) : `${workersMeter(cf.workers)}${renderAi(cf.ai)}${renderD1(cf.d1)}${workersDetail(cf.workers)}`;
  const own = s.own.error ? err(s.own.error) : `<h3>&gt; Errors by path · 24 h</h3>${renderErrors(s.own.errorsByPath)}
    <h3>&gt; Scheduled jobs</h3>${renderCrons(s.own.crons, now)}`;
  return `${cloud}${own}<p class="dim small">Cloudflare numbers refresh every 10 min and lag a few minutes; daily limits reset at 00:00 UTC.</p>`;
}

export const PRUNE_QUESTION = `Delete everything MIAP collected that is older than ${KEEP_DAYS} days?\n\n`
  + `Archive · trends will then only go back ${KEEP_DAYS} days (it shows up to 120 now). `
  + 'Your saved addresses and phone alerts are kept. This cannot be undone.';

export function renderPruned(result) {
  const total = Object.values(result.deleted).reduce((a, b) => a + b, 0);
  const parts = Object.entries(result.deleted).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`);
  return `Deleted ${total} rows from before ${result.before}${parts.length ? ` (${parts.join(', ')})` : ''}.`;
}
