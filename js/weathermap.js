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

// 5 °C bands, cold blue to hot red.
const TEMP_BANDS = [[-5, '#2c3e9e'], [0, '#3f6fd8'], [5, '#6fa8ff'], [10, '#4fc9d6'], [15, '#5fd38d'], [20, '#b8e05a'], [25, '#ffd84a'], [30, '#ff9f1a'], [35, '#ff5a36'], [Infinity, '#d7263d']];
export function tempColor(t) {
  return TEMP_BANDS.find(([below]) => t < below)[1];
}

// km/h, roughly Beaufort: calm, breeze, fresh, strong, gale.
const WIND_BANDS = [[12, '#7ff6ff'], [29, '#5fd38d'], [50, '#ffd84a'], [75, '#ff9f1a'], [Infinity, '#ff3b3b']];
export function windColor(kmh) {
  return WIND_BANDS.find(([below]) => kmh < below)[1];
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

const cellLabel = (L, p, html, cls) => L.marker([p.lat, p.lon], { icon: L.divIcon({ className: `wx-label ${cls}`, html, iconSize: [44, 20] }), interactive: false });

export function paintTemperature(grid) {
  const half = (2 * WEATHER_HALF_KM) / (GRID - 1) / 2; // km from a point to its cell edge
  return (L, layer) => {
    for (const p of grid) {
      const dLat = half / 111.32;
      const dLon = half / (111.32 * Math.cos((p.lat * Math.PI) / 180));
      L.rectangle([[p.lat - dLat, p.lon - dLon], [p.lat + dLat, p.lon + dLon]], { stroke: false, fillColor: tempColor(p.temp), fillOpacity: 0.45, interactive: false }).addTo(layer);
      cellLabel(L, p, `${Math.round(p.temp)}°`, '').addTo(layer);
    }
  };
}

// Arrows point where the wind blows TO (Open-Meteo gives where it comes FROM).
export function paintWind(grid) {
  return (L, layer) => {
    for (const p of grid) {
      const html = `<span class="arrow" style="color:${windColor(p.wind)};transform:rotate(${Math.round(p.from + 180)}deg)">↑</span>${Math.round(p.wind)}`;
      cellLabel(L, p, html, 'wind').addTo(layer);
    }
  };
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
    return `<p class="dim small">Now: ${Math.round(Math.min(...t))}° to ${Math.round(Math.max(...t))}° across the map · Open-Meteo</p>`;
  }
  const strongest = grid.reduce((a, b) => (b.gust > a.gust ? b : a));
  return `<p class="dim small">Now, km/h. Strongest gusts on the map: ${Math.round(strongest.gust)} km/h · Open-Meteo</p>`;
}

export function radarSummary(radar, now) {
  const minutes = Math.round((now - radar.time) / 60000);
  return `<p class="dim small">Radar at ${esc(at(radar.time))} (${minutes} min ago) · stronger colour = heavier rain · RainViewer</p>`;
}
