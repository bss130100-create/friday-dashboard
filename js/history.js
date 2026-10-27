// Trends panel: MIAP's memory. The Worker saves hourly snapshots into a Cloudflare D1
// database and serves them at /history (see relay/worker.js). Three views:
//   GNSS jamming per zone (daily high-interference cells) and attack origins.
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { lineChart } from './charts.js';

export function historyUrl(kind, days) {
  return `/history?${new URLSearchParams({ kind, days: String(days) })}`;
}

// The last 7 days vs the 7 before, as a whole percentage (null when there is no earlier week).
export function weekChange(values) {
  if (values.length < 14) return null;
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const last = sum(values.slice(-7));
  const before = sum(values.slice(-14, -7));
  return before === 0 ? null : Math.round(((last - before) / before) * 100);
}

// Fill missing days with 0, so a quiet day shows as a dip instead of being skipped.
export function dailySeries(rows, from, to, pick) {
  const byDate = new Map(rows.map((r) => [r.date, pick(r)]));
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
    const label = d.toISOString().slice(0, 10);
    out.push({ label, value: byDate.get(label) ?? 0 });
  }
  return out;
}

// rows: [{ date, <key>, ... }] -> top N groups by their last-7-days total, each with a full series.
export function topSeries(rows, key, valueOf, n) {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date).sort();
  const [from, to] = [dates[0], dates[dates.length - 1]];
  const groups = new Map();
  for (const r of rows) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  return [...groups.entries()]
    .map(([name, list]) => {
      const series = dailySeries(list, from, to, valueOf);
      return { name, series, recent: series.slice(-7).reduce((s, p) => s + p.value, 0) };
    })
    .filter((g) => g.recent > 0)
    .sort((a, b) => b.recent - a.recent)
    .slice(0, n);
}

function trendLine(name, series, unit, digits = 0) {
  const latest = series[series.length - 1].value;
  const change = weekChange(series.map((p) => p.value));
  const changeHtml = change === null ? '' : ` <span class="${change > 0 ? 'warm' : 'dim'}">${change > 0 ? '+' : ''}${change}% vs prev. week</span>`;
  return `<div class="trend"><div class="trend-head"><span>${esc(name)}</span>
    <span><span class="kpi-sm">${latest.toFixed(digits)}${unit}</span>${changeHtml}</span></div>${lineChart(series, { unit })}</div>`;
}

export function renderGnssHistory(data) {
  const top = topSeries(data.days, 'zone', (r) => r.high, 4);
  if (top.length === 0) return '<p class="dim">No GNSS history yet: the first snapshot comes with the next hourly run.</p>';
  const first = top[0].series[0].label;
  return `<p class="dim small">High-interference cells per day, since ${esc(first)}.</p>${top.map((g) => trendLine(g.name, g.series, '')).join('')}`;
}

export function renderAttackHistory(data) {
  const top = topSeries(data.days, 'origin', (r) => Math.round(r.pct * 10) / 10, 4);
  if (top.length === 0) return '<p class="dim">No attack history yet: the first snapshot comes with the next hourly run.</p>';
  const names = new Map(data.days.map((r) => [r.origin, r.name]));
  return `<p class="dim small">Share of blocked HTTP attack traffic by origin country, per day.</p>
    ${top.map((g) => trendLine(`${names.get(g.name) ?? g.name} (${g.name})`, g.series, '%', 1)).join('')}`;
}

export async function loadHistory(kind, days) {
  return fetchJson(historyUrl(kind, days));
}

export async function renderHistory() {
  const gnss = await loadHistory('gnss', 120);
  const attacks = await loadHistory('attacks', 90);
  return `<div class="history">
    <div><h3>GNSS jamming trend</h3>${renderGnssHistory(gnss)}</div>
    <div><h3>Attack origins trend</h3>${renderAttackHistory(attacks)}</div>
  </div>`;
}
