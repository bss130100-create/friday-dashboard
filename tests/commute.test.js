import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  geocodeUrl, parseGeocode, geocode, parseConfig, saveConfig, readConfig, routes, planUrl, parsePlan, renderRoute, loadCommute, renderCommute, fastest,
  soon, isWeekend, commuteSummary,
  reverseUrl, parseReverse, renderHere, loadHere,
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
const place = (name, lat = 50.8) => ({ name, lat, lon: 4.3 });
const CONFIG = { home: place('Home St 1'), works: [{ label: 'Office A', place: place('A', 50.7) }, { label: 'Office B', place: place('B', 50.9) }] };

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

test('four routes in the requested order, to work from where they start', () => {
  const here = { lat: 50.85, lon: 4.35 };
  const r = routes(CONFIG, { label: 'Here', place: here });
  assert.deepEqual(r.map((x) => x.label), ['Here → Office A', 'Here → Office B', 'Office A → Home', 'Office B → Home']);
  assert.equal(r[0].from, here);
  assert.equal(r[2].to.name, 'Home St 1');
  assert.equal(routes(CONFIG, { label: 'Home', place: CONFIG.home })[1].label, 'Home → Office B');
});

test('fastest: the 2 quickest usable trips, shown in departure order', () => {
  const now = new Date('2026-10-26T08:00:00Z');
  const t = (start, durationMin, cancelled = false) => ({ start: new Date(`2026-10-26T${start}:00Z`), durationMin, cancelled });
  const trips = [t('08:10', 73), t('08:30', 83), t('08:39', 74), t('08:50', 60, true), t('07:50', 50), t('09:00', 74)];
  assert.deepEqual(fastest(trips, now).map((x) => [x.start.toISOString().slice(11, 16), x.durationMin]), [['08:10', 73], ['08:39', 74]]);
  assert.deepEqual(fastest([t('08:50', 60, true)], now), []);
});

test('plan: delays, cancellations and leg names', () => {
  assert.equal(planUrl({ lat: 50.8357, lon: 4.3365 }, { lat: 50.6917, lon: 4.2057 }, 3),
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
  assert.match(html, /Leave in 12 min/);
  assert.match(html, /17:36 <span class="warm">\+3<\/span> → 18:01/);
  assert.match(html, /Cancelled/);
  assert.match(renderRoute('x', trips, new Date('2026-10-24T15:35:30Z')), /Leave now/);
  assert.match(renderRoute('x', [trips[1]], new Date('2026-10-24T15:00:00Z')), /No trip found/);
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
  const plans = await loadCommute(CONFIG, GRAND_PLACE);
  assert.equal(asked.length, 4);
  assert.deepEqual(plans.map((p) => p.label), ['Here → Office A', 'Here → Office B', 'Office A → Home', 'Office B → Home']);
  assert.equal(plans[0].trips.length, 2); // all planned trips are kept, cancelled ones too (the Today card needs them)
  const html = renderCommute(plans, new Date('2026-10-24T15:24:00Z'));
  assert.equal((html.match(/<h3>/g) ?? []).length, 4);
  assert.match(html, /^<p class="verdict">Weekend: no work commute today\.<\/p>/); // same verdict as the Today card
});

// Trimmed real reverse-geocode answer for the Grand-Place (public place).
const REVERSE = [
  { type: 'PLACE', name: "La Chaloupe d'Or", lat: 50.84673, lon: 4.35307, areas: [{ name: 'Bruxelles - Brussel', default: true }] },
  { type: 'ADDRESS', name: 'Grand-Place - Grote Markt 26', lat: 50.84675, lon: 4.35303, areas: [{ name: 'Bruxelles - Brussel', default: true }] },
];
const GRAND_PLACE = { lat: 50.8466, lon: 4.3528, accuracy: 8.4 };
const HOME = { name: 'Home St 1', lat: 50.8, lon: 4.3 };

test('reverse geocode: nearest street address, with its town', () => {
  assert.equal(reverseUrl(GRAND_PLACE), 'https://api.transitous.org/api/v1/reverse-geocode?place=50.84660%2C4.35280');
  assert.equal(parseReverse(REVERSE), 'Grand-Place - Grote Markt 26, Bruxelles - Brussel');
  assert.equal(parseReverse([]), 'no address nearby');
  assert.throws(() => parseReverse({}), /Unexpected/);
});

test('where am I: address, GPS fix and the way home; at home no trip is planned', () => {
  const now = new Date('2026-10-24T15:24:00Z');
  const html = renderHere(GRAND_PLACE, 'Grand-Place 26', HOME, parsePlan(PLAN), now);
  assert.match(html, /Grand-Place 26/);
  assert.match(html, /50\.84660, 4\.35280 · ±8 m · 6\.\d km from home/);
  assert.match(html, /Here → Home[\s\S]*Leave in 12 min/);
  assert.match(renderHere({ ...HOME, accuracy: 5 }, 'Home St 1', HOME, [], now), /You're home/);
});

test('Transitous requests from different panels never overlap', async () => {
  let inFlight = 0;
  let max = 0;
  globalThis.fetch = async (url) => {
    max = Math.max(max, ++inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return new Response(JSON.stringify(url.includes('reverse') ? REVERSE : PLAN));
  };
  const now = new Date('2026-10-24T15:24:00Z');
  const [commute, here] = await Promise.all([loadCommute(CONFIG, GRAND_PLACE), loadHere(GRAND_PLACE, HOME, now)]);
  assert.equal(max, 1, 'Transitous returns 429 for parallel requests');
  assert.equal(commute.length, 4);
  assert.match(here, /Here → Home/);
});

test('one failed Transitous request does not block the next', async () => {
  globalThis.fetch = async () => new Response('busy', { status: 429 });
  await assert.rejects(loadHere(GRAND_PLACE, HOME, new Date()), /HTTP 429 from api\.transitous\.org/);
  globalThis.fetch = async (url) => new Response(JSON.stringify(url.includes('reverse') ? REVERSE : PLAN));
  assert.match(await loadHere(GRAND_PLACE, HOME, new Date('2026-10-24T15:24:00Z')), /Grand-Place - Grote Markt 26/);
});

test('commute from where you are: already at a workplace means no trip to plan there', async () => {
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(url); return new Response(JSON.stringify(PLAN)); };
  const atOfficeA = { ...CONFIG.works[0].place, accuracy: 5 };
  const html = renderCommute(await loadCommute(CONFIG, atOfficeA), new Date('2026-10-24T15:24:00Z'));
  assert.match(html, /Here → Office A<\/h3><p class="leave">You're there\./);
  assert.equal(asked.length, 3); // Office B and the two trips home
  assert.ok(asked.every((u) => u.includes('numItineraries=6')));
});

// Today card. 2026-10-26 is a Monday (winter time, UTC+1): 15:24 UTC = 16:24 in Brussels, so the trips home matter.
const shift = (trips, ms) => trips.map((t) => ({ ...t, start: new Date(t.start.getTime() + ms), end: new Date(t.end.getTime() + ms), scheduled: new Date(t.scheduled.getTime() + ms) }));
const MONDAY = new Date('2026-10-26T15:24:00Z');
const mondayTrips = (ms = 0) => shift(parsePlan(PLAN), MONDAY - new Date('2026-10-24T15:24:00Z') + ms); // 16:36 (S2, due 16:34) and 16:50 (cancelled)
const allClear = (trips) => trips.map((t) => ({ ...t, cancelled: false, delayMin: 0 }));
const plans = (a, b, c, d) => [
  { label: 'Here → Office A', there: false, trips: a },
  { label: 'Here → Office B', there: false, trips: b },
  { label: 'Office A → Home', there: false, trips: c },
  { label: 'Office B → Home', there: false, trips: d },
];

test('soon: trips leaving in the next hour; weekend = Saturday and Sunday in Brussels', () => {
  const trips = parsePlan(PLAN); // 17:36 and 17:50 Brussels time
  assert.equal(soon(trips, new Date('2026-10-24T15:24:00Z')).length, 2);
  assert.equal(soon(trips, new Date('2026-10-24T14:40:00Z')).length, 1); // only 17:36 within the hour
  assert.equal(isWeekend(new Date('2026-10-24T12:00:00Z')), true);
  assert.equal(isWeekend(new Date('2026-10-25T23:30:00Z')), false); // Monday 00:30 in Brussels
});

test('Today commute card: says what is wrong first, then the next trip on the routes that matter now', () => {
  const html = commuteSummary(plans([], [], mondayTrips(), allClear(mondayTrips())), MONDAY);
  assert.match(html, /^<p class="verdict warm">16:50 bus 820 › tram 82 to Home is cancelled\.<\/p>/);
  assert.match(html, /<span class="route">Office A → Home<\/span><span class="">Leave in 12 min<\/span>\s*<span class="dim">25 min · there 17:01<\/span>/);
  assert.doesNotMatch(html, /Here → Office/);
  assert.match(html, /href="#commute"/);
  const late = mondayTrips().map((t) => ({ ...t, delayMin: 7 }));
  assert.match(commuteSummary(plans([], [], late, late), MONDAY), /16:34 train S2 to Home runs 7 min late, and 3 more problems\./);
});

test('Today commute card: all clear, nothing in the next hour, no trip, at work, weekend', () => {
  const morning = new Date(MONDAY.getTime() - 8 * 3600000); // 08:24 in Brussels: the trips to work matter
  const toWork = allClear(mondayTrips(-8 * 3600000));
  assert.match(commuteSummary(plans(toWork, toWork, [], []), morning), /^<p class="verdict ok">No delays or cancellations on your next trips\.<\/p>/);
  assert.match(commuteSummary(plans(toWork, toWork, [], []), new Date(morning.getTime() - 3 * 3600000)), /^<p class="verdict">No trips in the next hour\.<\/p>/);
  assert.match(commuteSummary(plans(toWork, [], [], []), morning), /<span class="route">Here → Office B<\/span><span class="dim">No trip found right now<\/span>/);
  const atWork = plans([], toWork, [], []);
  atWork[0].there = true;
  assert.match(commuteSummary(atWork, morning), /<span class="route">Here → Office A<\/span><span>You're there\.<\/span>/);
  assert.match(commuteSummary(plans(toWork, toWork, [], []), new Date('2026-10-24T08:00:00Z')), /^<p class="verdict">Weekend: no work commute today\.<\/p>/);
});
