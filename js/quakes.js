// Earthquakes panel: magnitude 2.5+ quakes of the last 24 h from the US Geological Survey.
import { fetchJson } from './http.js';
import { esc, ago } from './ui.js';
import { distanceKm } from './geo.js';
import { worldMap } from './worldmap.js';

export const QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

// GeoJSON -> [{ mag, place, time, lat, lon, depthKm, url }], newest first.
export function parseQuakes(json) {
  if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) throw new Error('USGS response is not a FeatureCollection');
  return json.features
    .map((q) => ({
      mag: q.properties.mag,
      place: q.properties.place ?? 'unknown location',
      time: new Date(q.properties.time),
      lon: q.geometry.coordinates[0],
      lat: q.geometry.coordinates[1],
      depthKm: q.geometry.coordinates[2],
      url: q.properties.url,
    }))
    .sort((a, b) => b.time - a.time);
}

export async function loadQuakes() {
  return parseQuakes(await fetchJson(QUAKES_URL));
}

export function renderQuakes(quakes, now, you) {
  if (quakes.length === 0) return '<p class="dim">No M2.5+ earthquakes in the last 24 h.</p>';
  const biggest = quakes.reduce((a, b) => (b.mag > a.mag ? b : a));
  const nearest = you ? quakes.reduce((a, b) => (distanceKm(you.lat, you.lon, b.lat, b.lon) < distanceKm(you.lat, you.lon, a.lat, a.lon) ? b : a)) : null;
  const map = worldMap({
    label: 'earthquakes map',
    zoomable: true,
    you,
    dots: quakes.map((q) => ({ lat: q.lat, lon: q.lon, r: Math.max(0.8, (q.mag - 2) * 0.9), cls: q.mag >= 5 ? 'hot pulse' : 'warm', title: `M${q.mag} ${q.place}` })),
  });
  return `${map}
    <div class="kpis">
      <div><span class="kpi">${quakes.length}</span><span class="dim">quakes 24h</span></div>
      <div><span class="kpi">M${biggest.mag.toFixed(1)}</span><span class="dim">${esc(biggest.place)}</span></div>
      ${nearest ? `<div><span class="kpi">${Math.round(distanceKm(you.lat, you.lon, nearest.lat, nearest.lon))} km</span><span class="dim">nearest: M${nearest.mag.toFixed(1)}</span></div>` : ''}
    </div>
    <ul class="list">${quakes.slice(0, 5).map((q) => `
      <li><span class="mag ${q.mag >= 5 ? 'hot' : ''}">M${q.mag.toFixed(1)}</span> <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.place)}</a>
        <span class="dim"> · ${ago(q.time, now)} · ${Math.round(q.depthKm)} km deep</span></li>`).join('')}
    </ul>`;
}
