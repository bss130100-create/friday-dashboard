import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gridPoints, gridUrl, parseGrid, tempColor, windColor, radarTiles, loadGrid, loadRadar, gridSummary, radarSummary, RADAR_INDEX_URL } from '../js/weathermap.js';

afterEach(() => { delete globalThis.fetch; });

const HERE = { lat: 50.85, lon: 4.35 };

test('grid: 7 x 7 points, 120 km square centred on you, north-west first', () => {
  const pts = gridPoints(HERE);
  assert.equal(pts.length, 49);
  assert.ok(pts[0].lat > HERE.lat && pts[0].lon < HERE.lon);
  assert.deepEqual(pts[24], HERE); // the middle point is you
  assert.ok(Math.abs((pts[0].lat - pts[48].lat) * 111.32 - 120) < 0.01);
  const url = new URL(gridUrl(pts));
  assert.equal(url.searchParams.get('latitude').split(',').length, 49);
  assert.equal(url.searchParams.get('current'), 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
});

test('grid answer: one entry per point, in order; anything else fails loudly', () => {
  const pts = gridPoints(HERE, 2, 10);
  const loc = (t) => ({ current: { temperature_2m: t, wind_speed_10m: 20, wind_direction_10m: 270, wind_gusts_10m: 41 } });
  const grid = parseGrid([loc(1), loc(2), loc(3), loc(4)], pts);
  assert.deepEqual(grid.map((p) => p.temp), [1, 2, 3, 4]);
  assert.equal(grid[0].from, 270);
  assert.throws(() => parseGrid([loc(1)], pts), /expected 4 grid points/);
  assert.throws(() => parseGrid([{}, {}, {}, {}], pts), /without current values/);
  assert.match(gridSummary(grid, 'temp'), /1° to 4°/);
  assert.match(gridSummary(grid, 'wind'), /gusts on the map: 41 km\/h/);
});

test('colours: temperature in 5 °C bands, wind by strength', () => {
  assert.equal(tempColor(-12), '#2c3e9e');
  assert.equal(tempColor(12), '#5fd38d');
  assert.equal(tempColor(40), '#d7263d');
  assert.equal(windColor(5), '#7ff6ff');
  assert.equal(windColor(90), '#ff3b3b');
});

test('radar: latest past frame as a tile URL with its time', () => {
  const json = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1792870800, path: '/v2/radar/a' }, { time: 1792871400, path: '/v2/radar/b' }] } };
  const r = radarTiles(json);
  assert.equal(r.url, 'https://tilecache.rainviewer.com/v2/radar/b/256/{z}/{x}/{y}/2/1_1.png');
  assert.equal(r.time.getTime(), 1792871400000);
  assert.match(radarSummary(r, new Date(1792871400000 + 7 * 60000)), /7 min ago/);
  assert.throws(() => radarTiles({ host: 'x', radar: { past: [] } }), /no radar frames/);
});

test('loaders: one request for the whole grid, one for the radar index', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    if (url === RADAR_INDEX_URL) return Response.json({ host: 'https://h', radar: { past: [{ time: 1, path: '/p' }] } });
    const n = new URL(url).searchParams.get('latitude').split(',').length;
    return Response.json(Array.from({ length: n }, () => ({ current: { temperature_2m: 9, wind_speed_10m: 10, wind_direction_10m: 0, wind_gusts_10m: 20 } })));
  };
  assert.equal((await loadGrid(HERE)).length, 49);
  assert.equal((await loadRadar()).url, 'https://h/p/256/{z}/{x}/{y}/2/1_1.png');
  assert.equal(asked.length, 2);
});
