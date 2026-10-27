import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { placesIn, stretchEnds, railShapes, parseDisturbances, parseStations, stationNamesNear, mentions } from '../js/rail.js';
import { roadColor, mapShapes } from '../js/trafficmap.js';
import { viewBounds } from '../js/basemap.js';
import { roadsUrl, renderRoads, renderRail, renderTraffic, loadTraffic, loadRail, moreByKind } from '../js/traffic.js';
import { readouts, localNow, loadBriefing, renderBriefing } from '../js/briefing.js';
import { isWeekend } from '../js/commute.js';

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
  { kind: 'roadClosed', what: 'Closed', roads: ['R0'], from: 'Ruisbroek', to: 'Drogenbos', delayMin: 0, km: 1.2, lat: 50.79, lon: 4.3, line: [[50.79, 4.3]] },
  { kind: 'jam', what: 'Stationary traffic', roads: ['E19'], from: 'Vilvoorde', to: 'Machelen', delayMin: 14, km: 3.4, lat: 50.92, lon: 4.43, line: [[50.92, 4.43], [50.93, 4.44]] },
  { kind: 'roadWorks', what: 'Road works', roads: [], from: 'A', to: 'B', delayMin: 0, km: 0.3, lat: 50.8, lon: 4.4, line: [[50.8, 4.4]] },
];

test('map: red = closed roads and live rail disruptions, orange = blockages, works left out', () => {
  assert.deepEqual(stretchEnds('Louvain / Leuven - Ottignies: No trains'), [['louvain', 'leuven'], ['ottignies']]);
  const stations = parseStations(STATIONS);
  const rail = railShapes(parseDisturbances(DISTURBANCES), stations);
  // newest first; Ottignies and Florenville are not in the trimmed station list -> one point each
  assert.deepEqual(rail.map((r) => [r.title.slice(0, 7), r.points]), [
    ['Louvain', [[50.88228, 4.715866]]], ['Florenv', [[49.5667, 5.5333]]], ['Brux.-M', [[50.835707, 4.336531]]],
  ]);
  assert.equal(roadColor('roadClosed'), 'red');
  assert.equal(roadColor('accident'), 'orange');
  assert.equal(roadColor('roadWorks'), null);
  const shapes = mapShapes(INCIDENTS, rail);
  assert.deepEqual(shapes.map((s) => [s.color, s.dashed, s.label]), [
    ['red', false, 'R0: Closed'],
    ['orange', false, 'E19: Stationary traffic (+14 min)'],
    ['red', true, 'Louvain / Leuven - Ottignies: No trains'],
    ['red', true, 'Florenville - Virton: Delays and cancellations'], // the planned works are not drawn
  ]);
  const [[s, w], [n, e]] = viewBounds(GRAND_PLACE, 25);
  assert.ok(Math.abs((n - s) * 111.32 - 50) < 0.01); // 50 km tall
  assert.ok(Math.abs((e - w) * 111.32 * Math.cos((GRAND_PLACE.lat * Math.PI) / 180) - 50) < 0.01); // and wide
});

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
  await assert.rejects(loadTraffic(GRAND_PLACE, NOW, 0), /roads: HTTP 503 from \/roads[\s\S]*rail: iRail \(Belgian rail data\) not responding, tried twice: HTTP 503 from api\.irail\.be/);
});

test('rail: one timeout is retried, two show a clear error', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('disturbances') && ++calls === 1) return new Response('gateway timeout', { status: 504 });
    if (url.includes('disturbances')) return Response.json(DISTURBANCES);
    return Response.json(STATIONS);
  };
  const rail = await loadRail(GRAND_PLACE, 0);
  assert.equal(calls, 2);
  assert.equal(rail.near.length, 2); // Leuven and Brussels-Midi lines
  globalThis.fetch = async () => new Response('gateway timeout', { status: 504 });
  await assert.rejects(loadRail(GRAND_PLACE, 0), /not responding, tried twice: HTTP 504 from api\.irail\.be\. Retrying at the next refresh/);
});

test('roads: the incidents left out are counted by kind, biggest first', () => {
  const rest = [{ kind: 'roadWorks' }, { kind: 'roadClosed' }, { kind: 'roadWorks' }, { kind: 'jam' }, { kind: 'roadWorks' }];
  assert.equal(moreByKind(rest), '+5 more: 3 works, 1 closed, 1 jam');
  const many = Array.from({ length: 10 }, () => ({ kind: 'jam', what: 'x', roads: [], delayMin: 0, km: 0 }));
  assert.match(renderRoads(many), /\+2 more: 2 jam/);
});

test('loadTraffic: roads from our Worker, rail from iRail', async () => {
  globalThis.fetch = async (url) => {
    if (url.startsWith('/roads')) return Response.json({ incidents: INCIDENTS });
    if (url.includes('disturbances')) return Response.json(DISTURBANCES);
    if (url.includes('stations')) return Response.json(STATIONS);
    throw new Error(`unexpected ${url}`);
  };
  const { html, shapes } = await loadTraffic(GRAND_PLACE, NOW);
  assert.match(html, /Roads within 40 km[\s\S]*CLOSED[\s\S]*Rail lines near you[\s\S]*Louvain \/ Leuven - Ottignies[\s\S]*1 more elsewhere/);
  assert.deepEqual(shapes.map((s) => s.color), ['red', 'orange', 'red']); // closure, jam, Leuven disruption
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
    atmosphere: { text: '  12 °C   light rain  ' },
    air: { text: 'ERROR', error: true },
    news: { text: 'Scanning news for "Brussels"…' },
    routes: { text: 'Home → Office A leave in 12 min' },
  });
  // NOW is a Saturday: the work commute is left out
  assert.equal(isWeekend(NOW), true);
  assert.deepEqual(readouts(doc, NOW), { Weather: '12 °C light rain' });
  const monday = new Date('2026-10-26T07:00:00Z');
  assert.equal(isWeekend(monday), false);
  assert.deepEqual(readouts(doc, monday), { Commute: 'Home → Office A leave in 12 min', Weather: '12 °C light rain' });
  assert.equal(localNow(NOW), 'Saturday 19:30');
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, method: init.method, body: JSON.parse(init.body) };
    return Response.json({ summary: 'Rain at 12 °C: take a coat.', updates: [], upcoming: [], actions: [] });
  };
  const html = await loadBriefing(readouts(doc, NOW), NOW);
  assert.match(html, /<p class="brief">Rain at 12 °C: take a coat\.<\/p>/);
  assert.match(html, /from 1 panel · Workers AI/);
  assert.doesNotMatch(html, /class="expand"/); // nothing to expand
  assert.deepEqual(sent, { url: '/briefing', method: 'POST', body: { now: 'Saturday 19:30', panels: { Weather: '12 °C light rain' } } });
  await assert.rejects(loadBriefing({}, NOW), /No panel data yet/);
});

test('briefing card: summary first, then updates, coming up and actions behind one expand button', () => {
  const html = renderBriefing({
    summary: 'S2 runs 7 min late: leave at 08:17.',
    updates: ['Rain from 10:00, 9 °C', '<b>x</b>'],
    upcoming: ['Sunset 17:20'],
    actions: ['Take an umbrella'],
  }, 9);
  assert.match(html, /^<p class="brief">S2 runs 7 min late: leave at 08:17\.<\/p>/);
  assert.match(html, /<div class="more"><div><h3>Updates<\/h3><ul class="brief-list"><li>Rain from 10:00, 9 °C<\/li><li>&lt;b&gt;x&lt;\/b&gt;<\/li><\/ul><h3>Coming up<\/h3>.*<h3>Recommended<\/h3><ul class="brief-list"><li>Take an umbrella<\/li><\/ul><\/div><\/div>/s);
  assert.match(html, /<button type="button" class="expand" aria-expanded="false"><span class="closed">2 updates · 1 coming up · 1 action<\/span>/);
  assert.match(html, /from 9 panels · Workers AI/);
});
