import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherUrl, parseWeather, describeWeatherCode, renderWeather } from '../js/weather.js';
import { WEATHER_JSON } from './fixtures.js';

test('weatherUrl contains rounded coordinates', () => {
  const url = weatherUrl({ lat: 44.426767, lon: 26.102538 });
  assert.match(url, /latitude=44\.427/);
  assert.match(url, /longitude=26\.103/);
});

test('parseWeather extracts the displayed values', () => {
  const w = parseWeather(WEATHER_JSON);
  assert.equal(w.tempC, 14.1);
  assert.equal(w.sky, 'OVERCAST');
  assert.equal(w.windFrom, 'W');
  assert.match(renderWeather(w), /14\.1<span class="unit">°C/);
});

test('parseWeather throws on an unexpected response', () => {
  assert.throws(() => parseWeather({ error: true, reason: 'bad' }), /no current data/);
});

test('unknown weather code is an error, not a blank', () => {
  assert.throws(() => describeWeatherCode(42), /Unknown WMO/);
});
