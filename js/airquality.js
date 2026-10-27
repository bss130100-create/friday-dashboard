// Air quality & pollen panel: Open-Meteo air-quality API (CAMS model data, free, no key).
// Pollen is only modelled for Europe; elsewhere the API returns null for it.
import { fetchJson } from './http.js';
import { esc } from './ui.js';

const POLLEN = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'];

export function airUrl({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: ['european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide', ...POLLEN.map((p) => `${p}_pollen`)].join(','),
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
}

// European AQI bands (EEA): 0-20 good ... >100 extremely poor.
export function aqiBand(aqi) {
  if (aqi <= 20) return 'GOOD';
  if (aqi <= 40) return 'FAIR';
  if (aqi <= 60) return 'MODERATE';
  if (aqi <= 80) return 'POOR';
  if (aqi <= 100) return 'VERY POOR';
  return 'EXTREMELY POOR';
}

// Rough, species-independent pollen bands in grains/m3 (good enough for a glance).
export function pollenBand(grains) {
  if (grains === null) return 'n/a';
  if (grains < 10) return 'low';
  if (grains < 50) return 'moderate';
  return 'high';
}

export function parseAir(json) {
  const c = json.current;
  if (!c || typeof c.european_aqi !== 'number') throw new Error('Air-quality response has no current AQI');
  return {
    aqi: c.european_aqi,
    pm25: c.pm2_5,
    pm10: c.pm10,
    ozone: c.ozone,
    no2: c.nitrogen_dioxide,
    pollen: POLLEN.map((name) => ({ name, grains: c[`${name}_pollen`] })),
  };
}

export async function loadAir(location) {
  return parseAir(await fetchJson(airUrl(location)));
}

export function renderAir(a) {
  const pct = Math.min(100, a.aqi);
  const hasPollen = a.pollen.some((p) => p.grains !== null);
  return `
    <div class="gauge-row">
      <div class="big">${a.aqi}<span class="unit"> EAQI</span></div>
      <div class="bar"><div class="fill ${a.aqi > 60 ? 'hot' : a.aqi > 40 ? 'warm' : ''}" style="width:${pct}%"></div></div>
      <div class="dim">${aqiBand(a.aqi)}</div>
    </div>
    <table>
      <tr><td>PM2.5</td><td>${a.pm25.toFixed(1)} µg/m³</td><td>PM10</td><td>${a.pm10.toFixed(1)} µg/m³</td></tr>
      <tr><td>O₃</td><td>${a.ozone.toFixed(0)} µg/m³</td><td>NO₂</td><td>${a.no2.toFixed(1)} µg/m³</td></tr>
    </table>
    <h3>Pollen</h3>
    ${hasPollen
      ? `<table class="small">${a.pollen.map((p) => `<tr><td>${esc(p.name[0].toUpperCase() + p.name.slice(1))}</td><td>${p.grains.toFixed(1)} grains/m³</td><td class="${pollenBand(p.grains) === 'high' ? 'hot' : ''}">${pollenBand(p.grains)}</td></tr>`).join('')}</table>`
      : '<p class="dim">No pollen data here: pollen is only modelled for Europe.</p>'}`;
}
