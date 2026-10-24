// Shared by every map panel (roads & rail, weather): Leaflet, loaded on first use, over OpenStreetMap
// streets (free, attribution required) darkened with CSS to fit the HUD. Each map zooms to a square
// around you the first time it is visible: Leaflet can't measure a map in a hidden tab.
const maps = [];
let leaflet = null;

async function loadLeaflet() {
  leaflet ??= await import('../vendor/leaflet.esm.js');
  return leaflet;
}

// South-west and north-east corners of the square halfKm around you.
export function viewBounds(here, halfKm) {
  const dLat = halfKm / 111.32;
  const dLon = halfKm / (111.32 * Math.cos((here.lat * Math.PI) / 180));
  return [[here.lat - dLat, here.lon - dLon], [here.lat + dLat, here.lon + dLon]];
}

// el = the map's <div>. draw(here, paint) clears the old overlays and calls paint(L, layer) to add new ones.
export function mapPanel(el, halfKm) {
  let map = null;
  let layer = null;
  let center = null;
  let fitted = false;
  const fitOnce = () => {
    if (fitted || !center || el.offsetWidth === 0) return;
    map.invalidateSize();
    map.fitBounds(viewBounds(center, halfKm));
    fitted = true;
  };
  const panel = {
    async draw(here, paint) {
      const L = await loadLeaflet();
      if (!map) {
        map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25 });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
        layer = L.layerGroup().addTo(map);
        map.setView([here.lat, here.lon], 9);
      }
      center = here;
      layer.clearLayers();
      paint(L, layer);
      L.circleMarker([here.lat, here.lon], { radius: 6, color: '#29d9ff', fillColor: '#29d9ff', fillOpacity: 1 }).bindPopup('You').addTo(layer);
      fitOnce();
    },
    resize() {
      if (!map) return;
      map.invalidateSize();
      fitOnce();
    },
  };
  maps.push(panel);
  return panel;
}

// Call when a tab opens: maps drawn while it was hidden must re-measure themselves.
export function resizeMaps() {
  for (const m of maps) m.resize();
}
