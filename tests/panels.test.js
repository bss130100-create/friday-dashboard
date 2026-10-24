// Tests for the map-based and environment panels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, worldMap } from '../js/worldmap.js';
import { parseQuakes, renderQuakes } from '../js/quakes.js';
import { outagesUrl, parseOutages, renderOutages } from '../js/outages.js';
import { parseAir, aqiBand, pollenBand, renderAir } from '../js/airquality.js';
import { moonPhase, parseAstro, renderAstro } from '../js/astro.js';
import { regionOf, parseGpsJam, renderGpsJam } from '../js/gpsjam.js';
import { attacksUrl, parseAttacks, renderAttacks } from '../js/attacks.js';
import { USGS_JSON, IODA_JSON, AIR_JSON, ASTRO_JSON, RADAR_JSON } from './fixtures.js';

const NOW = new Date('2026-10-24T14:00:00Z');
const BUCHAREST = { lat: 44.43, lon: 26.1 };

test('map projection: (0,0) is the centre, north-west corner is (0,0) in SVG', () => {
  assert.deepEqual(project(0, 0), [180, 90]);
  assert.deepEqual(project(90, -180), [0, 0]);
  assert.match(worldMap({ dots: [{ lat: 0, lon: 0 }] }), /<g transform="translate\(180\.0 90\.0\)"><circle r="1.5" data-r="1.5"/);
  assert.doesNotMatch(worldMap({}), /data-zoom/);
  assert.match(worldMap({ zoomable: true }), /data-zoom="in"/);
  assert.match(worldMap({ zoomable: true }), /<text x="184\.0" y="39\.2" data-span="1\.6">Belgium<\/text>/);
  assert.match(worldMap({}), /class="borders"/);
  assert.doesNotMatch(worldMap({}), /class="labels"/);
});

test('quakes: newest first, rendered with nearest distance', () => {
  const q = parseQuakes(USGS_JSON);
  assert.equal(q[0].place, '10 km N of Vrancea, Romania');
  assert.equal(q[0].lat, 45.8);
  const html = renderQuakes(q, NOW, BUCHAREST);
  assert.match(html, /nearest: M2\.6/);
  assert.match(html, /M4\.7/);
  assert.throws(() => parseQuakes({ type: 'Error' }), /not a FeatureCollection/);
});

test('outages: last 24 h window, sorted by score, signals named', () => {
  const url = new URL(outagesUrl(NOW));
  assert.equal(Number(url.searchParams.get('until')) - Number(url.searchParams.get('from')), 86400);
  const o = parseOutages(IODA_JSON);
  assert.equal(o[0].code, 'NF');
  assert.deepEqual(o[0].signals, ['Google traffic', 'BGP routes']);
  assert.match(renderOutages(o), /Lithuania/);
  assert.throws(() => parseOutages({ error: 'bad entity' }), /IODA: bad entity/);
});

test('air quality bands and pollen', () => {
  assert.equal(aqiBand(15), 'GOOD');
  assert.equal(aqiBand(55), 'MODERATE');
  assert.equal(aqiBand(130), 'EXTREMELY POOR');
  assert.equal(pollenBand(null), 'n/a');
  assert.equal(pollenBand(60), 'high');
  const a = parseAir(AIR_JSON);
  assert.equal(a.aqi, 34);
  assert.match(renderAir(a), /RAGWEED/);
});

test('air quality outside Europe says pollen is not modelled', () => {
  const nullPollen = { current: { ...AIR_JSON.current, alder_pollen: null, birch_pollen: null, grass_pollen: null, mugwort_pollen: null, olive_pollen: null, ragweed_pollen: null } };
  assert.match(renderAir(parseAir(nullPollen)), /only modelled for Europe/);
});

test('moon phase: known full moon 2026-10-26 and new moon 2026-10-10', () => {
  // Published dates: full moon 2026-10-26 04:12 UTC, new moon 2026-10-10 15:50 UTC.
  const full = moonPhase(new Date('2026-10-26T04:12:00Z'));
  assert.equal(full.name, 'FULL MOON');
  assert.ok(full.illumination > 0.98);
  const fresh = moonPhase(new Date('2026-10-10T15:50:00Z'));
  assert.equal(fresh.name, 'NEW MOON');
  assert.ok(fresh.illumination < 0.02);
});

test('astro: local sunrise is converted to the right UTC instant', () => {
  const a = parseAstro(ASTRO_JSON);
  assert.equal(a.sunrise.toISOString(), '2026-10-24T04:54:00.000Z');
  assert.match(renderAstro(a, NOW), /daylight left/);
});

test('gpsjam: regions and counts', () => {
  assert.equal(regionOf(55, 20), 'Baltic / Kaliningrad');
  assert.equal(regionOf(34.5, 33), 'Eastern Mediterranean');
  assert.equal(regionOf(0, 0), 'Elsewhere');
  const j = parseGpsJam({ date: '2026-10-23', cells: [[55, 20, 2], [56, 21, 2], [34.5, 33, 2], [10, 10, 1]] });
  assert.deepEqual(j.regions[0], { name: 'Baltic / Kaliningrad', high: 2 });
  assert.match(renderGpsJam(j, BUCHAREST), /3<\/span><span class="dim">high-interference/);
  assert.throws(() => parseGpsJam({}), /malformed/);
});

test('attacks: parsed from Radar, errors surfaced, needs relay', () => {
  const p = parseAttacks(RADAR_JSON);
  assert.equal(p[0].from, 'US');
  assert.equal(p[0].pct, 4.21);
  assert.match(renderAttacks(p), /class="arc attack"/);
  assert.throws(() => parseAttacks({ success: false, errors: [{ message: 'Authentication error' }] }), /Authentication error/);
  assert.throws(() => attacksUrl(''), /Relay not set up/);
});
