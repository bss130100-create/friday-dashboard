// Sun & moon panel. Sunrise/sunset come from Open-Meteo; the moon phase is computed locally.
//
// Moon maths: the moon goes from new moon to new moon in 29.530589 days (the "synodic
// month"). Count days since a known new moon, take the remainder, and you know the phase.
// Accurate to about half a day, which is plenty for a dashboard.
import { fetchJson } from './http.js';
import { esc } from './ui.js';

export const SYNODIC_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
const DAY_MS = 86400 * 1000;

export function moonPhase(date) {
  const age = (((date - KNOWN_NEW_MOON_MS) / DAY_MS) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS;
  const fraction = age / SYNODIC_DAYS; // 0 = new, 0.5 = full
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const names = ['NEW MOON', 'WAXING CRESCENT', 'FIRST QUARTER', 'WAXING GIBBOUS', 'FULL MOON', 'WANING GIBBOUS', 'LAST QUARTER', 'WANING CRESCENT'];
  const name = names[Math.round(fraction * 8) % 8];
  const daysToFull = ((0.5 - fraction + 1) % 1) * SYNODIC_DAYS;
  return { age, fraction, illumination, name, nextFull: new Date(date.getTime() + daysToFull * DAY_MS) };
}

export function astroUrl({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    daily: 'sunrise,sunset,daylight_duration,uv_index_max',
    timezone: 'auto',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseAstro(json) {
  const d = json.daily;
  if (!d?.sunrise?.[0]) throw new Error('Forecast response has no daily sunrise');
  return {
    // Open-Meteo gives local times without an offset ("2026-10-24T07:54"); add it back to get real instants.
    sunrise: localToDate(d.sunrise[0], json.utc_offset_seconds),
    sunset: localToDate(d.sunset[0], json.utc_offset_seconds),
    daylightS: d.daylight_duration[0],
    uvMax: d.uv_index_max[0],
  };
}

function localToDate(local, offsetSeconds) {
  return new Date(Date.parse(`${local}:00Z`) - offsetSeconds * 1000);
}

export async function loadAstro(location) {
  return parseAstro(await fetchJson(astroUrl(location)));
}

const hm = (seconds) => `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`;
const clock = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

// Moon drawn as a lit disc with a shadow ellipse sliding across it.
function moonSvg({ fraction }) {
  const waxing = fraction < 0.5;
  const k = Math.cos(2 * Math.PI * fraction); // 1 = new, -1 = full
  const rx = Math.abs(k) * 40;
  const litHalf = waxing ? 'M50,10 A40,40 0 0 1 50,90' : 'M50,10 A40,40 0 0 0 50,90';
  const terminator = `A${rx.toFixed(1)},40 0 0 ${(k > 0) === waxing ? 0 : 1} 50,10`;
  return `<svg class="moon" viewBox="0 0 100 100" role="img" aria-label="moon phase">
    <circle cx="50" cy="50" r="40" class="moon-dark"/><path d="${litHalf} ${terminator}Z" class="moon-lit"/></svg>`;
}

export function renderAstro(a, now) {
  const m = moonPhase(now);
  const dayLeft = (a.sunset - now) / 1000;
  const sunState = now < a.sunrise ? `sunrise in ${hm((a.sunrise - now) / 1000)}` : dayLeft > 0 ? `${hm(dayLeft)} of daylight left` : 'sun has set';
  return `
    <div class="astro">
      <div>
        <h3>SOL</h3>
        <table>
          <tr><td>RISE</td><td>${clock(a.sunrise)}</td></tr>
          <tr><td>SET</td><td>${clock(a.sunset)}</td></tr>
          <tr><td>DAY</td><td>${hm(a.daylightS)}</td></tr>
          <tr><td>UV MAX</td><td>${a.uvMax.toFixed(1)}</td></tr>
        </table>
        <p class="accent">${esc(sunState)}</p>
      </div>
      <div class="moon-box">
        ${moonSvg(m)}
        <div>${m.name}</div>
        <div class="dim">${Math.round(m.illumination * 100)}% lit · day ${m.age.toFixed(1)}</div>
        <div class="dim">full moon ${m.nextFull.toISOString().slice(0, 10)}</div>
      </div>
    </div>`;
}
