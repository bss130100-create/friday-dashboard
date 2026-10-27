// Attack map panel: top application-layer (HTTP) attack routes of the last 24 h,
// as seen by Cloudflare's network (Cloudflare Radar API, through our Worker).
// "Origin" is where the attack traffic came FROM (often hijacked machines or proxies),
// not necessarily where the attacker sits.
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { worldMap } from './worldmap.js';
import { COUNTRIES } from './countries-data.js';

// Same Worker that serves this page (relay/worker.js), so a plain path is enough.
export function attacksUrl() {
  return '/attacks';
}

export function parseAttacks(json) {
  if (!json.success) throw new Error(`Cloudflare Radar: ${json.errors?.map((e) => e.message).join('; ') ?? 'request failed'}`);
  const rows = json.result?.top_0;
  if (!Array.isArray(rows)) throw new Error('Radar response has no top_0 list');
  return rows.map((r) => ({
    from: r.originCountryAlpha2,
    fromName: r.originCountryName,
    to: r.targetCountryAlpha2,
    toName: r.targetCountryName,
    pct: Number(r.value),
  }));
}

export async function loadAttacks() {
  return parseAttacks(await fetchJson(attacksUrl()));
}

export function renderAttacks(pairs) {
  if (pairs.length === 0) return '<p class="dim">Radar returned no attack routes.</p>';
  const max = Math.max(...pairs.map((p) => p.pct));
  const mapped = pairs.filter((p) => COUNTRIES[p.from] && COUNTRIES[p.to] && p.from !== p.to);
  const ends = new Map();
  for (const p of mapped) {
    ends.set(p.from, 'src');
    if (!ends.has(p.to)) ends.set(p.to, 'dst');
  }
  const map = worldMap({
    zoomable: true,
    label: 'attack map',
    arcs: mapped.map((p) => ({ from: COUNTRIES[p.from], to: COUNTRIES[p.to], cls: 'attack', width: (0.3 + (p.pct / max) * 1.4).toFixed(2) })),
    dots: [...ends].map(([code, kind]) => ({ lat: COUNTRIES[code][0], lon: COUNTRIES[code][1], r: 1.6, cls: kind === 'src' ? 'hot' : 'cool', title: COUNTRIES[code][2] })),
  });
  return `${map}
    <ul class="list compact">${pairs.slice(0, 8).map((p) => `
      <li><span class="tag hot">${esc(p.from)}</span> &rarr; <span class="tag cool">${esc(p.to)}</span>
        <span class="dim">${esc(p.fromName)} &rarr; ${esc(p.toName)}</span> <span class="accent">${p.pct.toFixed(1)}%</span></li>`).join('')}
    </ul>
    <p class="dim small">Share of all HTTP attack traffic Cloudflare blocked, last 24 h.</p>`;
}
