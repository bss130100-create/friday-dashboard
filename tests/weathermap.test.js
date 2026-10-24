import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gridPoints, gridUrl, parseGrid, bilinear, colorAt, tempStops, WIND_STOPS, scaleBar, radarTiles, loadGrid, loadRadar, gridSummary, radarSummary, RADAR_INDEX_URL } from '../js/weathermap.js';

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

test('smooth field: corners keep the grid values, the middle blends them', () => {
  const field = bilinear([0, 10, 20, 30], 2, 3); // 2 x 2 grid -> 3 x 3 picture
  assert.deepEqual([...field], [0, 5, 10, 10, 15, 20, 20, 25, 30]);
  const big = bilinear(Array.from({ length: 49 }, (_, i) => i), 7, 64);
  assert.equal(big[0], 0);
  assert.equal(big[64 * 64 - 1], 48);
  // padded one step: the picture's border holds the edge values, the grid sits inside
  const padded = bilinear([0, 10, 20, 30], 2, 4, 1); // reaches -1..2 grid steps, 1 step per pixel
  assert.deepEqual([...padded], [0, 0, 10, 10, 0, 0, 10, 10, 20, 20, 30, 30, 20, 20, 30, 30]);
});

test('colours: blended between stops, ends held', () => {
  const stops = [[0, '#000000'], [10, '#ffffff']];
  assert.deepEqual(colorAt(stops, 5), [128, 128, 128]);
  assert.deepEqual(colorAt(stops, -3), [0, 0, 0]);
  assert.deepEqual(colorAt(stops, 99), [255, 255, 255]);
  assert.deepEqual(colorAt(WIND_STOPS, 80), [255, 59, 59]);
});

test('temperature scale: the map\'s own range, at least 6 °C wide', () => {
  const g = (temps) => temps.map((temp) => ({ temp }));
  assert.deepEqual(tempStops(g([9, 10, 11])).map(([v]) => v), [7, 8.5, 10, 11.5, 13]);
  assert.deepEqual(tempStops(g([0, 20])).map(([v]) => v), [0, 5, 10, 15, 20]);
  assert.match(scaleBar(tempStops(g([0, 20])), '°'), /<span>0°<\/span><i style="background:linear-gradient\(90deg, #3f6fd8 0%.*#ff6a3d 100%\)"><\/i><span>20°<\/span>/);
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
