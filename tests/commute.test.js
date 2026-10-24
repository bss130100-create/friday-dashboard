import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  geocodeUrl, parseGeocode, geocode, parseConfig, saveConfig, readConfig, routes, planUrl, parsePlan, renderRoute, loadCommute,
} from '../js/commute.js';

// Trimmed real Transitous answers (2026-10-24), public places only.
const GEOCODE = [
  { type: 'STOP', name: 'Tubize, Gare', lat: 50.69171, lon: 4.20573, areas: [{ name: 'Tubize', default: true }] },
  { type: 'PLACE', name: 'Gare de Tubize', lat: 50.69197, lon: 4.205615, areas: [] },
];
const leg = (mode, start, end, extra = {}) => ({ mode, startTime: start, endTime: end, scheduledStartTime: start, ...extra });
const PLAN = { itineraries: [
  { startTime: '2026-10-24T15:36:00Z', endTime: '2026-10-24T16:01:00Z', legs: [
    leg('WALK', '2026-10-24T15:36:00Z', '2026-10-24T15:37:00Z'),
    leg('SUBURBAN', '2026-10-24T15:37:00Z', '2026-10-24T16:00:00Z', { routeShortName: 'S2', scheduledStartTime: '2026-10-24T15:34:00Z' }),
    leg('WALK', '2026-10-24T16:00:00Z', '2026-10-24T16:01:00Z'),
  ] },
  { startTime: '2026-10-24T15:50:00Z', endTime: '2026-10-24T16:40:00Z', legs: [
    leg('BUS', '2026-10-24T15:50:00Z', '2026-10-24T16:10:00Z', { routeShortName: '820', cancelled: true }),
    leg('TRAM', '2026-10-24T16:15:00Z', '2026-10-24T16:40:00Z', { routeShortName: '82' }),
  ] },
] };
const place = (name) => ({ name, lat: 50.8, lon: 4.3 });
const CONFIG = { home: place('Home St 1'), works: [{ label: 'Office A', place: place('A') }, { label: 'Office B', place: place('B') }] };

// Stands in for the Worker's /settings/commute (GET returns null until a PUT).
function fakeSettings() {
  let saved = 'null';
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, '/settings/commute');
    if (init.method === 'PUT') saved = init.body;
    return new Response(saved, { headers: { 'Content-Type': 'application/json' } });
  };
}
afterEach(() => { delete globalThis.fetch; });

test('geocode: first hit with its town; nothing found fails loudly', async () => {
  assert.equal(geocodeUrl('Gare de Tubize'), 'https://api.transitous.org/api/v1/geocode?text=Gare+de+Tubize&language=en');
  assert.deepEqual(parseGeocode(GEOCODE, 'x'), { name: 'Tubize, Gare', lat: 50.69171, lon: 4.20573 });
  assert.throws(() => parseGeocode([], 'Nowhere 1'), /Address not found: "Nowhere 1"/);
  assert.throws(() => parseGeocode({ error: 1 }, 'x'), /Unexpected/);
  await assert.rejects(geocode('ab'), /full address/);
});

test('config: needs home + exactly two workplaces; saved to the Worker and read back', async () => {
  fakeSettings();
  assert.equal(await readConfig(), null);
  assert.deepEqual(await saveConfig(CONFIG), CONFIG);
  assert.deepEqual(await readConfig(), CONFIG);
  await assert.rejects(saveConfig({ home: CONFIG.home, works: [] }), /both workplaces/);
  assert.throws(() => parseConfig({ ...CONFIG, home: { name: 'x' } }), /home address/);
  assert.throws(() => parseConfig({ ...CONFIG, works: [CONFIG.works[0]] }), /both workplaces/);
});

test('four routes in the requested order', () => {
  assert.deepEqual(routes(CONFIG).map((r) => r.label), ['Home → Office A', 'Home → Office B', 'Office A → Home', 'Office B → Home']);
  assert.equal(routes(CONFIG)[2].to.name, 'Home St 1');
});

test('plan: delays, cancellations and leg names', () => {
  assert.equal(planUrl({ lat: 50.8357, lon: 4.3365 }, { lat: 50.6917, lon: 4.2057 }),
    'https://api.transitous.org/api/v5/plan?fromPlace=50.83570%2C4.33650&toPlace=50.69170%2C4.20570&numItineraries=3');
  const [a, b] = parsePlan(PLAN);
  assert.equal(a.durationMin, 25);
  assert.equal(a.delayMin, 3);
  assert.deepEqual(a.legs, ["walk 1'", 'train S2', "walk 1'"]);
  assert.equal(b.cancelled, true);
  assert.deepEqual(b.legs, ['bus 820', 'tram 82']);
  assert.throws(() => parsePlan({}), /Unexpected/);
});

test('render: countdown to the next running trip, in Brussels time', () => {
  const trips = parsePlan(PLAN);
  const html = renderRoute('Home → Office A', trips, new Date('2026-10-24T15:24:00Z'));
  assert.match(html, /leave in 12 min/);
  assert.match(html, /17:36 <span class="warm">\+3<\/span> → 18:01/);
  assert.match(html, /CANCELLED/);
  assert.match(renderRoute('x', trips, new Date('2026-10-24T15:35:30Z')), /LEAVE NOW/);
  assert.match(renderRoute('x', [trips[1]], new Date('2026-10-24T15:00:00Z')), /no trip found/);
});

test('loadCommute plans all four routes, one request at a time', async () => {
  const asked = [];
  let inFlight = 0;
  globalThis.fetch = async (url) => {
    asked.push(url);
    assert.equal(++inFlight, 1, 'requests must not overlap (Transitous returns 429)');
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return new Response(JSON.stringify(PLAN));
  };
  const html = await loadCommute(CONFIG, new Date('2026-10-24T15:24:00Z'));
  assert.equal(asked.length, 4);
  assert.equal((html.match(/<h3>/g) ?? []).length, 4);
});
