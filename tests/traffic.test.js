import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { placesIn, parseDisturbances, parseStations, stationNamesNear, mentions } from '../js/rail.js';
import { roadsUrl, renderRoads, renderRail, renderTraffic, loadTraffic } from '../js/traffic.js';
import { readouts, localNow, loadBriefing } from '../js/briefing.js';

afterEach(() => { delete globalThis.fetch; });

// Trimmed real iRail answers (2026-10-24).
const DISTURBANCES = { disturbance: [
  { title: 'Louvain / Leuven - Ottignies: No trains', description: 'Train traffic is interrupted.', type: 'disturbance', link: 'https://www.belgianrail.be/x', timestamp: '1792860384' },
  { title: 'Brux.-Midi/Brus.-Zuid - Nivelles / Nijvel', description: 'Works.', type: 'planned', link: 'https://www.belgianrail.be/y', timestamp: '1792763461' },
  { title: 'Florenville - Virton: Delays and cancellations', description: 'Disrupted.', type: 'disturbance', link: 'https://www.belgianrail.be/z', timestamp: '1792859848' },
] };
const STATIONS = { station: [
  { name: 'Brussels-South/Brussels-Midi', standardname: 'Brussel-Zuid/Bruxelles-Midi', locationX: '4.336531', locationY: '50.835707' },
  { name: 'Leuven', standardname: 'Leuven', locationX: '4.715866', locationY: '50.88228' },
  { name: 'Virton', standardname: 'Virton', locationX: '5.5333', locationY: '49.5667' },
] };
const GRAND_PLACE = { lat: 50.8466, lon: 4.3528 };
const NOW = new Date('2026-10-24T17:30:00Z');

test('rail: places in a title, Brussels abbreviations expanded, accents dropped', () => {
  assert.deepEqual(placesIn('Louvain / Leuven - Ottignies: No trains'), ['louvain', 'leuven', 'ottignies']);
  assert.deepEqual(placesIn('Brux.-Midi/Brus.-Zuid - Nivelles / Nijvel'), ['bruxelles-midi', 'brussel-zuid', 'nivelles', 'nijvel']);
  assert.deepEqual(placesIn('Flémalle-Haute'), ['flemalle-haute']);
});

test('rail: disruptions naming a station within 30 km count as near', () => {
  const all = parseDisturbances(DISTURBANCES);
  assert.equal(all[0].title, 'Louvain / Leuven - Ottignies: No trains'); // newest first
  const names = stationNamesNear(parseStations(STATIONS), GRAND_PLACE);
  assert.ok(names.has('bruxelles-midi') && names.has('leuven') && !names.has('virton'));
  assert.deepEqual(all.filter((d) => mentions(d, names)).map((d) => d.planned), [false, true]);
  assert.throws(() => parseDisturbances({}), /no disturbance list/);
  assert.throws(() => parseStations({}), /no station list/);
});

const INCIDENTS = [
  { kind: 'roadClosed', what: 'Closed', roads: ['R0'], from: 'Ruisbroek', to: 'Drogenbos', delayMin: 0, km: 1.2, lat: 50.79, lon: 4.3 },
  { kind: 'jam', what: 'Stationary traffic', roads: ['E19'], from: 'Vilvoorde', to: 'Machelen', delayMin: 14, km: 3.4, lat: 50.92, lon: 4.43 },
];

test('roads: URL, severity labels and an empty answer', () => {
  assert.equal(roadsUrl(GRAND_PLACE), '/roads?lat=50.847&lon=4.353');
  const html = renderRoads(INCIDENTS);
  assert.match(html, /tag hot">CLOSED<\/span> <b>R0<\/b> Ruisbroek → Drogenbos/);
  assert.match(html, /tag warm">JAM[\s\S]*\+14 min, 3\.4 km/);
  assert.match(renderRoads([]), /No incidents/);
});

test('rail view: near disruptions linked, the rest counted', () => {
  const html = renderRail({ near: parseDisturbances(DISTURBANCES).slice(0, 1), elsewhere: 2 }, NOW);
  assert.match(html, /tag hot">NOW[\s\S]*href="https:\/\/www\.belgianrail\.be\/x"[\s\S]*2 more elsewhere/);
  assert.match(renderRail({ near: [], elsewhere: 5 }, NOW), /No disruptions on lines near you/);
});

test('roads and rail fail independently; both failing is a panel error', async () => {
  const html = renderTraffic({ status: 'rejected', reason: new Error('TOMTOM_KEY secret is not set') }, { status: 'fulfilled', value: { near: [], elsewhere: 3 } }, NOW);
  assert.match(html, /ERROR: TOMTOM_KEY secret is not set[\s\S]*3 more elsewhere/);
  globalThis.fetch = async () => new Response('down', { status: 503 });
  await assert.rejects(loadTraffic(GRAND_PLACE, NOW), /roads: HTTP 503 from \/roads[\s\S]*rail: HTTP 503 from api\.irail\.be/);
});

test('loadTraffic: roads from our Worker, rail from iRail', async () => {
  globalThis.fetch = async (url) => {
    if (url.startsWith('/roads')) return Response.json({ incidents: INCIDENTS });
    if (url.includes('disturbances')) return Response.json(DISTURBANCES);
    if (url.includes('stations')) return Response.json(STATIONS);
    throw new Error(`unexpected ${url}`);
  };
  const html = await loadTraffic(GRAND_PLACE, NOW);
  assert.match(html, /ROADS[\s\S]*CLOSED[\s\S]*RAIL[\s\S]*Louvain \/ Leuven - Ottignies[\s\S]*1 more elsewhere/);
});

// A tiny stand-in for the page: sections with a .body, some in error.
function fakeDoc(panels) {
  return {
    getElementById: (id) => {
      const p = panels[id];
      if (!p) return null;
      return { classList: { contains: (c) => c === 'error' && p.error }, querySelector: () => ({ textContent: p.text }) };
    },
  };
}

test('briefing: reads healthy, loaded panels only, and posts them', async () => {
  const doc = fakeDoc({
    weather: { text: '  12 °C   light rain  ' },
    quakes: { text: 'ERROR', error: true },
    news: { text: 'Scanning news for "Brussels"…' },
  });
  assert.deepEqual(readouts(doc), { Weather: '12 °C light rain' });
  assert.equal(localNow(NOW), 'Saturday 19:30');
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, method: init.method, body: JSON.parse(init.body) };
    return Response.json({ text: 'Rain at 12 °C: take a coat.' });
  };
  assert.match(await loadBriefing(readouts(doc), NOW), /<p class="brief">Rain at 12 °C: take a coat\.<\/p>/);
  assert.deepEqual(sent, { url: '/briefing', method: 'POST', body: { now: 'Saturday 19:30', panels: { Weather: '12 °C light rain' } } });
  await assert.rejects(loadBriefing({}, NOW), /No panel data yet/);
});
