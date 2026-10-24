// GPS jamming panel: yesterday's GNSS interference hotspots (GPSJam), prepared daily
// by scripts/gpsjam.py into data/gpsjam.json on this same site.
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { worldMap } from './worldmap.js';

export const GPSJAM_DATA_URL = 'data/gpsjam.json';

// Known hot zones, checked in order (first match wins). [name, latMin, latMax, lonMin, lonMax]
export const REGIONS = [
  ['Baltic / Kaliningrad', 53, 61, 12, 30],
  ['Finnmark / Kola', 66, 72, 20, 45],
  ['Ukraine & neighbours', 43, 53, 20, 41],
  ['Turkey / Anatolia', 36, 43, 26, 41],
  ['Caucasus / Caspian', 38, 48, 41, 55],
  ['Eastern Mediterranean', 30, 37.5, 28, 37],
  ['Middle East / Gulf', 23, 38, 37, 62],
  ['Red Sea / Horn of Africa', 5, 23, 32, 52],
  ['Pakistan / India border', 26, 38, 64, 80],
  ['Myanmar', 10, 28, 92, 102],
  ['Western Russia', 50, 66, 30, 60],
  ['Siberia / Mongolia', 42, 60, 85, 120],
  ['Korean Peninsula', 33, 43, 124, 132],
];

export function regionOf(lat, lon) {
  const hit = REGIONS.find(([, la0, la1, lo0, lo1]) => lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1);
  return hit ? hit[0] : 'Elsewhere';
}

export function parseGpsJam(json) {
  if (!json.date || !Array.isArray(json.cells)) throw new Error('gpsjam.json is malformed');
  const cells = json.cells.map(([lat, lon, level]) => ({ lat, lon, level }));
  const counts = {};
  for (const c of cells.filter((c) => c.level === 2)) {
    const r = regionOf(c.lat, c.lon);
    counts[r] = (counts[r] ?? 0) + 1;
  }
  const regions = Object.entries(counts).map(([name, high]) => ({ name, high })).sort((a, b) => b.high - a.high);
  return { date: json.date, cells, regions };
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
