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
const hourLabel = (iso) => `${iso.slice(11, 16)}Z`;
const err = (e) => `<p class="err">ERROR: ${esc(e)}</p>`;
const fmt = (n) => n.toLocaleString('en-GB');
const size = (bytes) => (bytes < 1e9 ? `${(bytes / 1e6).toFixed(1)} MB` : `${(bytes / 1e9).toFixed(1)} GB`);

// One usage line: label, a bar against the free limit, the numbers.
export function meter(label, value, limit, show = fmt) {
  const p = pct(value, limit);
  const cls = p >= 90 ? 'hot' : p >= 60 ? 'warm' : '';
  return `<div class="meter"><span class="dim small">${esc(label)}</span>
    <div class="bar"><div class="fill ${cls}" style="width:${Math.min(100, p)}%"></div></div>
    <span class="small ${cls}">${esc(show(value))} / ${esc(show(limit))} · ${p}%</span></div>`;
}

const workersMeter = (w) => (w.error ? err(`Worker analytics: ${w.error}`) : meter('Worker requests today', w.requestsToday, FREE.requests));

function workersDetail(w) {
  if (w.error) return '';
  const cpuClass = w.cpuP99Ms > FREE.cpuMs ? 'hot' : w.cpuP99Ms > FREE.cpuMs / 2 ? 'warm' : '';
  return `<div class="kpis">
      <div><span class="kpi ${w.errors ? 'hot' : ''}">${fmt(w.errors)}</span><span class="dim">errors in 24 h · ${w.requests ? pct(w.errors, w.requests) : 0}% of ${fmt(w.requests)}</span></div>
      <div><span class="kpi">${w.cpuP50Ms} / <span class="${cpuClass}">${w.cpuP99Ms}</span></span><span class="dim">CPU ms, median / p99 (limit ${FREE.cpuMs})</span></div>
      <div><span class="kpi">${fmt(w.subrequests)}</span><span class="dim">calls to other APIs, 24 h</span></div>
    </div>
    <p class="dim small">Requests per hour</p>${barChart(w.hours.map((h) => ({ label: hourLabel(h.hour), value: h.requests })), { unit: ' requests' })}
    <p class="dim small">Errors per hour</p>${barChart(w.hours.map((h) => ({ label: hourLabel(h.hour), value: h.errors })), { height: 32, unit: ' errors' })}
    <p class="dim small">CPU time p99 per hour</p>${lineChart(w.hours.map((h) => ({ label: hourLabel(h.hour), value: h.cpuP99Ms })), { unit: ' ms' })}
    <table class="small">${w.outcomes.map((o) => `<tr><td>${esc(o.status)}</td><td class="${o.status === 'success' ? '' : 'hot'}">${fmt(o.requests)}</td></tr>`).join('')}</table>`;
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

const CRON_NAMES = { '0 * * * *': 'Hourly snapshot + quake alerts', '*/5 * * * *': 'Commute alerts (every 5 min)' };

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
