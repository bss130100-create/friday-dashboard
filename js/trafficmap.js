// Map for the Roads & rail panel, ~50 km across, centred on you.
// Streets: OpenStreetMap tiles (free, attribution required), darkened with CSS to fit the HUD.
// Red = closed roads, and rail disruptions (dashed, station to station: iRail gives the stretch, not the track).
// Orange = jams, accidents, lane closures, broken-down vehicles. Road works without a closure are only in the list.
// Leaflet (vendor/leaflet.esm.js, BSD-2) draws it; it is loaded only when the map is first shown.
import { esc } from './ui.js';

const BLOCKAGES = new Set(['jam', 'accident', 'laneClosed', 'brokenDownVehicle']);
const COLORS = { red: '#ff3b3b', orange: '#ff9f1a' };
const HALF_KM = 25;

export function roadColor(kind) {
  if (kind === 'roadClosed') return 'red';
  return BLOCKAGES.has(kind) ? 'orange' : null;
}

export function mapShapes(incidents, rail) {
  const roads = incidents
    .filter((i) => roadColor(i.kind))
    .map((i) => ({ color: roadColor(i.kind), dashed: false, points: i.line, label: `${[i.roads.join(' / '), i.what].filter(Boolean).join(': ')}${i.delayMin > 0 ? ` (+${i.delayMin} min)` : ''}` }));
  const trains = rail.filter((r) => !r.planned).map((r) => ({ color: 'red', dashed: true, points: r.points, label: r.title }));
  return [...roads, ...trains];
}

// South-west and north-east corners of the square HALF_KM around you.
export function viewBounds(here, km = HALF_KM) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((here.lat * Math.PI) / 180));
  return [[here.lat - dLat, here.lon - dLon], [here.lat + dLat, here.lon + dLon]];
}

let L = null;
let map = null;
let layer = null;
let fitted = false;
let center = null;

// Leaflet can only measure the map while its tab is visible: zoom to you the first time it is.
function fitOnce() {
  if (fitted || !center || map.getContainer().offsetWidth === 0) return;
  map.invalidateSize();
  map.fitBounds(viewBounds(center));
  fitted = true;
}

export async function drawTrafficMap(el, here, shapes) {
  L ??= await import('../vendor/leaflet.esm.js');
  if (!map) {
    map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.5 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.setView([here.lat, here.lon], 10);
  }
  center = here;
  layer.clearLayers();
  for (const s of shapes) {
    const style = { color: COLORS[s.color], weight: 5, opacity: 0.95, dashArray: s.dashed ? '8 6' : null };
    const shape = s.points.length === 1
      ? L.circleMarker(s.points[0], { ...style, radius: 7, fillColor: COLORS[s.color], fillOpacity: 0.5 })
      : L.polyline(s.points, style);
    shape.bindPopup(esc(s.label)).addTo(layer);
  }
  L.circleMarker([here.lat, here.lon], { radius: 6, color: '#29d9ff', fillColor: '#29d9ff', fillOpacity: 1 }).bindPopup('You').addTo(layer);
  fitOnce();
}

// Call when the Global events tab opens: the map was hidden, so Leaflet must re-measure it.
export function resizeTrafficMap() {
  if (!map) return;
  map.invalidateSize();
  fitOnce();
}
