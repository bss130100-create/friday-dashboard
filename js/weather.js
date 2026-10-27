// Weather panel: current conditions + today's sunrise/sunset from Open-Meteo (free, no key).
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { compassPoint } from './geo.js';

export function weatherUrl({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,weather_code',
    timezone: 'auto',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

// WMO weather codes used by Open-Meteo -> short text.
const WMO = {
  0: 'CLEAR', 1: 'MAINLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST', 45: 'FOG', 48: 'RIME FOG',
  51: 'LIGHT DRIZZLE', 53: 'DRIZZLE', 55: 'HEAVY DRIZZLE', 56: 'FREEZING DRIZZLE', 57: 'FREEZING DRIZZLE',
  61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN', 66: 'FREEZING RAIN', 67: 'FREEZING RAIN',
  71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW', 77: 'SNOW GRAINS',
  80: 'RAIN SHOWERS', 81: 'RAIN SHOWERS', 82: 'VIOLENT SHOWERS', 85: 'SNOW SHOWERS', 86: 'SNOW SHOWERS',
  95: 'THUNDERSTORM', 96: 'THUNDERSTORM + HAIL', 99: 'THUNDERSTORM + HAIL',
};

export function describeWeatherCode(code) {
  const text = WMO[code];
  if (!text) throw new Error(`Unknown WMO weather code ${code}`);
  return text;
}

// Raw API JSON -> the few numbers we show. Throws if the shape is unexpected.
export function parseWeather(json) {
  const c = json.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('Weather response has no current data');
  return {
    tempC: c.temperature_2m,
    feelsC: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windKmh: c.wind_speed_10m,
    windFrom: compassPoint(c.wind_direction_10m),
    pressureHpa: c.pressure_msl,
    sky: describeWeatherCode(c.weather_code),
    code: c.weather_code,
  };
}

const WET = (code) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
const SNOW = (code) => (code >= 71 && code <= 77) || code === 85 || code === 86;

// What to wear, from the feels-like temperature and what is falling right now.
export function wearAdvice(w) {
  const base = w.feelsC < 5 ? 'Cold: coat, hat and gloves'
    : w.feelsC < 12 ? 'Cool: take a coat'
      : w.feelsC < 18 ? 'Mild: a light jacket is enough'
        : 'Warm: no jacket needed';
  return `${base}${WET(w.code) ? ', and an umbrella' : SNOW(w.code) ? ', and good shoes for snow' : ''}.`;
}

export async function loadWeather(location) {
  return parseWeather(await fetchJson(weatherUrl(location)));
}

export function renderWeather(w) {
  const sky = w.sky.charAt(0) + w.sky.slice(1).toLowerCase();
  return `
    <div class="count"><span class="big">${w.tempC.toFixed(1)}</span><span class="unit">°C</span></div>
    <p class="lead">${esc(sky)} · feels ${w.feelsC.toFixed(1)}°C</p>
    <p class="verdict ok">${esc(wearAdvice(w))}</p>
    <div class="kpis">
      <div><span class="kpi">${w.humidity}%</span><span class="dim">humidity</span></div>
      <div><span class="kpi">${w.windKmh.toFixed(0)}<span class="unit">km/h</span></span><span class="dim">wind from ${w.windFrom}</span></div>
      <div><span class="kpi">${w.pressureHpa.toFixed(0)}<span class="unit">hPa</span></span><span class="dim">pressure</span></div>
    </div>`;
}
