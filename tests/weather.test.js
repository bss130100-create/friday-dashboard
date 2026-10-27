import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherUrl, parseWeather, describeWeatherCode, renderWeather, wearAdvice } from '../js/weather.js';
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
  const html = renderWeather(w);
  assert.match(html, /<span class="big">14\.1<\/span><span class="unit">°C/);
  assert.match(html, /Overcast · feels 12\.9°C/);
  assert.match(html, /<p class="verdict ok">Mild: a light jacket is enough\.<\/p>/); // feels 12.9
});

test('what to wear: from the feels-like temperature, plus rain or snow falling now', () => {
  const w = (feelsC, code = 3) => ({ feelsC, code });
  assert.equal(wearAdvice(w(2)), 'Cold: coat, hat and gloves.');
  assert.equal(wearAdvice(w(11.9, 61)), 'Cool: take a coat, and an umbrella.');
  assert.equal(wearAdvice(w(15, 80)), 'Mild: a light jacket is enough, and an umbrella.');
  assert.equal(wearAdvice(w(-3, 73)), 'Cold: coat, hat and gloves, and good shoes for snow.');
  assert.equal(wearAdvice(w(22, 0)), 'Warm: no jacket needed.');
});

test('parseWeather throws on an unexpected response', () => {
  assert.throws(() => parseWeather({ error: true, reason: 'bad' }), /no current data/);
});

test('unknown weather code is an error, not a blank', () => {
  assert.throws(() => describeWeatherCode(42), /Unknown WMO/);
});
