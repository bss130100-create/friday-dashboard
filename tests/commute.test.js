import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStations, findStation, parseConfig, saveConfig, readConfig, connectionsUrl,
  parseConnections, goingToWork, doorToDoor, renderTrip, loadCommute,
} from '../js/commute.js';

// Trimmed real iRail answers (2026-10-24).
const STATIONS = { station: [
  { id: 'BE.NMBS.008814118', name: 'Vorst-Oost/Forest-Est', standardname: 'Vorst-Oost/Forest-Est' },
  { id: 'BE.NMBS.008883808', name: 'Tubize', standardname: 'Tubize' },
  { id: 'BE.NMBS.008814001', name: 'Brussels-South/Brussels-Midi', standardname: 'Brussel-Zuid/Bruxelles-Midi' },
] };
const t = (iso) => String(Date.parse(iso) / 1000);
const CONNECTIONS = { connection: [
  { departure: { time: t('2026-10-24T05:12:00Z'), delay: '180', platform: '2', canceled: '0' },
    arrival: { time: t('2026-10-24T05:48:00Z'), delay: '180', canceled: '0' }, vias: { number: '1' } },
  { departure: { time: t('2026-10-24T05:42:00Z'), delay: '0', platform: '2', canceled: '1' },
    arrival: { time: t('2026-10-24T06:18:00Z'), delay: '0', canceled: '1' } },
] };
const CONFIG = {
  home: { id: 'BE.NMBS.008814118', name: 'Vorst-Oost/Forest-Est' }, homeMin: 10,
  works: [{ label: 'Office', station: { id: 'BE.NMBS.008883808', name: 'Tubize' }, min: 15 }],
};

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}
afterEach(() => { delete globalThis.localStorage; delete globalThis.fetch; });

test('stations: typed name (either language form) maps to the iRail id', () => {
  const st = parseStations(STATIONS);
  assert.deepEqual(findStation(st, ' tubize '), { id: 'BE.NMBS.008883808', name: 'Tubize' });
  assert.equal(findStation(st, 'Brussel-Zuid/Bruxelles-Midi').id, 'BE.NMBS.008814001');
  assert.throws(() => findStation(st, 'Atlantis'), /Unknown station "Atlantis"/);
  assert.throws(() => parseStations({}), /Unexpected/);
});

test('config: validated, saved and read back', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(readConfig(), null);
  saveConfig(CONFIG);
  assert.deepEqual(readConfig(), CONFIG);
  assert.throws(() => parseConfig({ ...CONFIG, homeMin: -5 }), /home station or minutes/);
  assert.throws(() => parseConfig({ ...CONFIG, works: [] }), /at least one workplace/);
});

test('connections: delay added, cancelled flagged, url uses ids', () => {
  assert.equal(connectionsUrl('A', 'B'), 'https://api.irail.be/v1/connections/?from=A&to=B&format=json&lang=en&results=3&alerts=false');
  const [first, second] = parseConnections(CONNECTIONS);
  assert.equal(first.depart.toISOString(), '2026-10-24T05:15:00.000Z');
  assert.equal(first.departDelayMin, 3);
  assert.equal(first.changes, 1);
  assert.equal(second.canceled, true);
  assert.equal(second.changes, 0);
  assert.throws(() => parseConnections({ error: 'x' }), /Unexpected/);
});

test('direction flips at 13:00 Brussels time', () => {
  assert.equal(goingToWork(new Date('2026-10-24T10:59:00Z')), true); // 12:59 CEST
  assert.equal(goingToWork(new Date('2026-10-24T11:00:00Z')), false); // 13:00 CEST
});

test('door to door = walk + train + last leg; next trip says when to leave', () => {
  const [first] = parseConnections(CONNECTIONS);
  const d = doorToDoor(first, 10, 15);
  assert.equal(d.leave.toISOString(), '2026-10-24T05:05:00.000Z');
  assert.equal(d.totalMin, 61);
  const html = renderTrip('HOME → Office', parseConnections(CONNECTIONS), 10, 15, new Date('2026-10-24T04:53:00Z'));
  assert.match(html, /leave in 12 min/);
  assert.match(html, /07:15 <span class="warm">\+3<\/span> pl 2/); // shown in Brussels time
  assert.match(html, /CANCELLED/);
  assert.match(renderTrip('x', parseConnections(CONNECTIONS), 10, 15, new Date('2026-10-24T05:04:30Z')), /LEAVE NOW/);
});

test('loadCommute asks iRail home -> work in the morning', async () => {
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(url); return new Response(JSON.stringify(CONNECTIONS)); };
  const html = await loadCommute(CONFIG, new Date('2026-10-24T04:53:00Z'));
  assert.match(asked[0], /from=BE\.NMBS\.008814118&to=BE\.NMBS\.008883808/);
  assert.match(html, /HOME → Office/);
});
