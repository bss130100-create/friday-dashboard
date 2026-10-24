// Weather maps around you, ~120 km across:
//   Temperature and wind: Open-Meteo "current" values on a 7 x 7 grid of points 20 km apart, in ONE
//   request (free, no key; the whole grid counts as about one call of the 10,000 a day).
//   Rain: RainViewer's latest radar picture (free for personal use, past 2 h only, sharp up to zoom 7).
import { fetchJson } from './http.js';
import { esc } from './ui.js';

export const WEATHER_HALF_KM = 60;
const GRID = 7;
export const RADAR_INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json';

// GRID x GRID points over the square around you, north-west first, row by row.
export function gridPoints(here, n = GRID, halfKm = WEATHER_HALF_KM) {
  const dLat = halfKm / 111.32;
  const dLon = halfKm / (111.32 * Math.cos((here.lat * Math.PI) / 180));
  const points = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      points.push({ lat: here.lat + dLat - (2 * dLat * r) / (n - 1), lon: here.lon - dLon + (2 * dLon * c) / (n - 1) });
    }
  }
  return points;
}

export function gridUrl(points) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(3)).join(','),
    longitude: points.map((p) => p.lon.toFixed(3)).join(','),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kmh',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

// Open-Meteo answers a list of locations with a list, in the same order.
export function parseGrid(json, points) {
  if (!Array.isArray(json) || json.length !== points.length) throw new Error(`Open-Meteo: expected ${points.length} grid points`);
  return json.map((loc, i) => {
    const c = loc.current;
    if (typeof c?.temperature_2m !== 'number' || typeof c.wind_speed_10m !== 'number') throw new Error('Open-Meteo: grid point without current values');
    return { ...points[i], temp: c.temperature_2m, wind: c.wind_speed_10m, gust: c.wind_gusts_10m, from: c.wind_direction_10m };
  });
}

// ---------- smooth colour fields ----------
// The 7 x 7 values are blended (bilinear) into a size x size field, coloured, and laid over the map as
// one semi-transparent picture: a smooth gradient instead of blocks.

// values: n x n, row by row (north first) -> size x size, same order.
// pad: grid steps the picture reaches beyond the outer points; out there the edge values continue.
export function bilinear(values, n, size, pad = 0) {
  const out = new Float32Array(size * size);
  const at = (i) => Math.min(Math.max(-pad + (i / (size - 1)) * (n - 1 + 2 * pad), 0), n - 1);
  for (let y = 0; y < size; y++) {
    const fy = at(y);
    const r = Math.min(Math.floor(fy), n - 2);
    const ty = fy - r;
    for (let x = 0; x < size; x++) {
      const fx = at(x);
      const c = Math.min(Math.floor(fx), n - 2);
      const tx = fx - c;
      const top = values[r * n + c] * (1 - tx) + values[r * n + c + 1] * tx;
      const bottom = values[(r + 1) * n + c] * (1 - tx) + values[(r + 1) * n + c + 1] * tx;
      out[y * size + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// stops: [[value, '#rrggbb'], ...] ascending. Values outside take the end colours.
export function colorAt(stops, v) {
  if (v <= stops[0][0]) return rgb(stops[0][1]);
  const i = stops.findIndex(([at]) => v < at);
  if (i === -1) return rgb(stops.at(-1)[1]);
  const [[a, ca], [b, cb]] = [stops[i - 1], stops[i]];
  const t = (v - a) / (b - a);
  return rgb(ca).map((x, k) => Math.round(x + (rgb(cb)[k] - x) * t));
}

// Temperature colours follow this map's own range (at least 6 °C wide), so a few degrees still show.
const TEMP_COLORS = ['#3f6fd8', '#4fc9d6', '#5fd38d', '#ffd84a', '#ff6a3d'];
export function tempStops(grid) {
  const t = grid.map((p) => p.temp);
  const mid = (Math.min(...t) + Math.max(...t)) / 2;
  const half = Math.max(3, (Math.max(...t) - Math.min(...t)) / 2);
  return TEMP_COLORS.map((c, i) => [mid - half + (2 * half * i) / (TEMP_COLORS.length - 1), c]);
}

// Wind colours are fixed (km/h): calm to gale.
export const WIND_STOPS = [[0, '#29d9ff'], [20, '#5fd38d'], [40, '#ffd84a'], [60, '#ff9f1a'], [80, '#ff3b3b']];

const FIELD_PX = 64;
const FIELD_PAD = 1; // the picture covers one grid step (20 km) past the points, so it fills the whole view

// Browser only: the coloured field as a picture (data URL).
function fieldImage(values, stops) {
  const field = bilinear(values, GRID, FIELD_PX, FIELD_PAD);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FIELD_PX;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(FIELD_PX, FIELD_PX);
  field.forEach((v, i) => {
    img.data.set([...colorAt(stops, v), 255], i * 4);
  });
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function fieldBounds(grid) {
  const dLat = (grid[0].lat - grid.at(-1).lat) / (GRID - 1) * FIELD_PAD;
  const dLon = (grid.at(-1).lon - grid[0].lon) / (GRID - 1) * FIELD_PAD;
  return [[grid.at(-1).lat - dLat, grid[0].lon - dLon], [grid[0].lat + dLat, grid.at(-1).lon + dLon]];
}

// Your value sits under your dot; ▲/▼ sit just above their point, clear of the attribution at the bottom.
const label = (L, p, html, cls = '') => L.marker([p.lat, p.lon], { icon: L.divIcon({ className: `wx-label ${cls}`, html, iconSize: [64, 20], iconAnchor: cls === 'big' ? [32, -6] : [32, 22] }), interactive: false });
const you = (grid) => grid[(grid.length - 1) / 2]; // the middle grid point is where you are

export function paintTemperature(grid) {
  const lo = grid.reduce((a, b) => (b.temp < a.temp ? b : a));
  const hi = grid.reduce((a, b) => (b.temp > a.temp ? b : a));
  return (L, layer) => {
    L.imageOverlay(fieldImage(grid.map((p) => p.temp), tempStops(grid)), fieldBounds(grid), { opacity: 0.5, interactive: false, className: 'wx-field' }).addTo(layer);
    label(L, you(grid), `${you(grid).temp.toFixed(1)}°`, 'big').addTo(layer);
    if (hi !== you(grid)) label(L, hi, `▲ ${Math.round(hi.temp)}°`).addTo(layer);
    if (lo !== you(grid)) label(L, lo, `▼ ${Math.round(lo.temp)}°`).addTo(layer);
  };
}

// Same-size arrows pointing where the wind blows TO (Open-Meteo gives where it comes FROM).
export function paintWind(grid) {
  return (L, layer) => {
    L.imageOverlay(fieldImage(grid.map((p) => p.wind), WIND_STOPS), fieldBounds(grid), { opacity: 0.45, interactive: false, className: 'wx-field' }).addTo(layer);
    for (const p of grid) {
      if (p === you(grid)) continue;
      const icon = L.divIcon({ className: 'wx-arrow', html: `<span style="transform:rotate(${Math.round(p.from + 180)}deg)">↑</span>`, iconSize: [16, 16] });
      L.marker([p.lat, p.lon], { icon, interactive: false }).addTo(layer);
    }
    label(L, you(grid), `${Math.round(you(grid).wind)} km/h`, 'big').addTo(layer);
  };
}

// Colour bar under a map: the stops as a gradient with the end values.
export function scaleBar(stops, unit) {
  const gradient = stops.map(([, c], i) => `${c} ${Math.round((100 * i) / (stops.length - 1))}%`).join(', ');
  return `<div class="wx-scale"><span>${Math.round(stops[0][0])}${unit}</span><i style="background:linear-gradient(90deg, ${gradient})"></i><span>${Math.round(stops.at(-1)[0])}${unit}</span></div>`;
}

// Latest radar picture -> Leaflet tile URL and its time. Colour scheme 2 = Universal Blue (the only free one).
export function radarTiles(json) {
  const latest = json?.radar?.past?.at(-1);
  if (!json?.host || !latest?.path) throw new Error('RainViewer: no radar frames');
  return { url: `${json.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, time: new Date(latest.time * 1000) };
}

export async function loadGrid(here) {
  const points = gridPoints(here);
  return parseGrid(await fetchJson(gridUrl(points)), points);
}

export async function loadRadar() {
  return radarTiles(await fetchJson(RADAR_INDEX_URL));
}

export function paintRain(radar) {
  return (L, layer) => {
    L.tileLayer(radar.url, { maxNativeZoom: 7, maxZoom: 18, opacity: 0.85, attribution: 'Radar © <a href="https://www.rainviewer.com">RainViewer</a>' }).addTo(layer);
  };
}

const at = (date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);

export function gridSummary(grid, kind) {
  if (kind === 'temp') {
    const t = grid.map((p) => p.temp);
    return `${scaleBar(tempStops(grid), '°')}<p class="dim small">Now: ${Math.round(Math.min(...t))}° to ${Math.round(Math.max(...t))}° across the map (▼ coldest, ▲ warmest) · Open-Meteo</p>`;
  }
  const strongest = grid.reduce((a, b) => (b.gust > a.gust ? b : a));
  return `${scaleBar(WIND_STOPS, '')}<p class="dim small">Wind now, km/h; arrows show where it blows. Strongest gusts on the map: ${Math.round(strongest.gust)} km/h · Open-Meteo</p>`;
}

export function radarSummary(radar, now) {
  const minutes = Math.round((now - radar.time) / 60000);
  return `<p class="dim small">Radar at ${esc(at(radar.time))} (${minutes} min ago) · stronger colour = heavier rain · RainViewer</p>`;
}
