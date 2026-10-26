// Map for the Roads & rail panel, ~50 km across, centred on you.
// Red = closed roads, and rail disruptions (dashed, station to station: iRail gives the stretch, not the track).
// Orange = jams, accidents, lane closures, broken-down vehicles. Road works without a closure are only in the list.
// The map itself (streets, zoom, Leaflet) is basemap.js.
import { esc } from './ui.js';

const BLOCKAGES = new Set(['jam', 'accident', 'laneClosed', 'brokenDownVehicle']);
const COLORS = { red: '#FF7043', orange: '#FFB347' }; // Reactor Amber: critical, watch
export const TRAFFIC_HALF_KM = 25; // ~50 km across

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

// Draws the shapes on the panel's map (see basemap.js).
export function drawTrafficMap(panel, here, shapes) {
  return panel.draw(here, (L, layer) => {
    for (const s of shapes) {
      const style = { color: COLORS[s.color], weight: 5, opacity: 0.95, dashArray: s.dashed ? '8 6' : null };
      const shape = s.points.length === 1
        ? L.circleMarker(s.points[0], { ...style, radius: 7, fillColor: COLORS[s.color], fillOpacity: 0.5 })
        : L.polyline(s.points, style);
      shape.bindPopup(esc(s.label)).addTo(layer);
    }
  });
}
