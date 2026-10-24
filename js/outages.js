// Internet outages panel: countries with detected internet outages in the last 24 h,
// from IODA (Georgia Tech). IODA watches BGP routes, active probing ("ping") and
// Google traffic per country and flags sudden drops.
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { worldMap } from './worldmap.js';
import { COUNTRIES } from './countries-data.js';

export function outagesUrl(now) {
  const until = Math.floor(now.getTime() / 1000);
  const params = new URLSearchParams({ from: String(until - 86400), until: String(until), entityType: 'country', limit: '20' });
  return `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary?${params}`;
}

// Which signal saw it, in plain words.
const SIGNALS = { 'bgp.median': 'BGP routes', 'ping-slash24.median': 'active probing', 'gtr.sarima': 'Google traffic', 'merit-nt.median': 'telescope' };

export function parseOutages(json) {
  if (json.error) throw new Error(`IODA: ${json.error}`);
  if (!Array.isArray(json.data)) throw new Error('IODA response has no data list');
  return json.data
    .map((d) => ({
      code: d.entity.code,
      name: d.entity.name,
      score: d.scores.overall,
      events: d.event_cnt,
      signals: Object.keys(d.scores).filter((k) => k !== 'overall').map((k) => SIGNALS[k] ?? k),
    }))
    .sort((a, b) => b.score - a.score);
}

export async function loadOutages(now) {
  return parseOutages(await fetchJson(outagesUrl(now)));
}

// IODA scores span many orders of magnitude, so compare them on a log scale.
const severity = (score) => (score > 1e6 ? 'hot' : score > 1e4 ? 'warm' : 'cool');

export function renderOutages(outages) {
  if (outages.length === 0) return '<p class="dim">No country-level outages detected in the last 24 h.</p>';
  const located = outages.filter((o) => COUNTRIES[o.code]);
  const map = worldMap({
    label: 'internet outages map',
    zoomable: true,
    dots: located.map((o) => ({ lat: COUNTRIES[o.code][0], lon: COUNTRIES[o.code][1], r: 2.5, cls: `${severity(o.score)} pulse`, title: o.name })),
  });
  return `${map}
    <ul class="list">${outages.slice(0, 8).map((o) => `
      <li><span class="tag ${severity(o.score)}">${esc(o.code)}</span> ${esc(o.name)}
        <span class="dim"> · ${o.events} event${o.events === 1 ? '' : 's'} · ${esc(o.signals.join(', '))}</span></li>`).join('')}
    </ul>`;
}
