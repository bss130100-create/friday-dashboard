// GPS jamming panel: yesterday's GNSS interference hotspots (GPSJam), prepared daily
// by scripts/gpsjam.py into data/gpsjam.json on this same site.
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { worldMap } from './worldmap.js';

export const GPSJAM_DATA_URL = 'data/gpsjam.json';

// gpsjam.json: { date, regions: [{ name, high, medium }], cells: [[lat, lon, level]] }.
// The hot zones (Baltic, Black Sea, ...) are defined once, in scripts/gpsjam.py.
export function parseGpsJam(json) {
  if (!json.date || !Array.isArray(json.cells) || !Array.isArray(json.regions)) throw new Error('gpsjam.json is malformed');
  return {
    date: json.date,
    cells: json.cells.map(([lat, lon, level]) => ({ lat, lon, level })),
    regions: json.regions.filter((r) => r.high > 0),
  };
}

export async function loadGpsJam() {
  return parseGpsJam(await fetchJson(GPSJAM_DATA_URL));
}

export function renderGpsJam(j, you) {
  const high = j.cells.filter((c) => c.level === 2).length;
  const map = worldMap({
    label: 'GPS interference map',
    zoomable: true,
    you,
    dots: j.cells.map((c) => ({ lat: c.lat, lon: c.lon, r: c.level === 2 ? 1.1 : 0.7, cls: c.level === 2 ? 'hot' : 'warm' })),
  });
  return `${map}
    <div class="kpis">
      <div><span class="kpi hot">${high}</span><span class="dim">high-interference cells</span></div>
      <div><span class="kpi">${j.cells.length - high}</span><span class="dim">medium</span></div>
      <div><span class="kpi">${esc(j.date)}</span><span class="dim">UTC day</span></div>
    </div>
    <table class="small">${j.regions.slice(0, 8).map((r) => `<tr><td>${esc(r.name)}</td><td class="hot">${r.high}</td></tr>`).join('')}</table>
    <p class="dim small">A cell is "high" when &gt;10% of aircraft there reported degraded GPS. Data: gpsjam.org.</p>`;
}
