// Shared world map (land + country borders) used by the jamming and attack panels.
// Equirectangular projection: longitude -> x, latitude -> y (viewBox 0 0 360 180).
import { LAND_PATH } from './worldmap-data.js';
import { BORDERS_PATH } from './borders-data.js';
import { LABELS } from './labels-data.js';
import { esc } from './ui.js';

export function project(lat, lon) {
  return [lon + 180, 90 - lat];
}

const f = (n) => n.toFixed(1);

// A curved line between two points (bulges upward, like flight/attack arcs in films).
function arcPath(from, to) {
  const [x1, y1] = project(...from);
  const [x2, y2] = project(...to);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.3;
  return `M${f(x1)},${f(y1)} Q${f(mx)},${f(my)} ${f(x2)},${f(y2)}`;
}

// A dot is a circle centred at (0,0) inside a translated group, so zoom.js can resize it
// (data-r = radius at 1x).
function dot(x, y, r, cls, title = '') {
  return `<g transform="translate(${f(x)} ${f(y)})"><circle r="${r}" data-r="${r}" class="${cls}">${title ? `<title>${esc(title)}</title>` : ''}</circle></g>`;
}

// Country names; zoom.js shows only those big enough on screen (more appear as you zoom in).
const LABEL_SVG = `<g class="labels">${LABELS.map(([name, lat, lon, span]) => {
  const [x, y] = project(lat, lon);
  return `<text x="${f(x)}" y="${f(y)}" data-span="${span}">${esc(name)}</text>`;
}).join('')}</g>`;

const ZOOM_CONTROLS = `<div class="zoom-ctl">
  <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
  <button type="button" data-zoom="out" aria-label="Zoom out">&minus;</button>
  <button type="button" data-zoom="reset" aria-label="Reset zoom">&#x27F2;</button>
  <span class="zoom-level">1.0×</span></div>`;

// dots: [{ lat, lon, r, cls, title }], arcs: [{ from: [lat, lon], to: [lat, lon], cls, width }], you: { lat, lon }
// zoomable: adds +/−/reset buttons and country names; the panel must also call makeZoomable() (zoom.js).
export function worldMap({ dots = [], arcs = [], you = null, label = 'world map', zoomable = false }) {
  const dotSvg = dots.map((d) => dot(...project(d.lat, d.lon), d.r ?? 1.5, d.cls ?? '', d.title));
  const arcSvg = arcs.map((a) => `<path d="${arcPath(a.from, a.to)}" class="arc ${a.cls ?? ''}" data-w="${a.width ?? 0.6}" style="stroke-width:${a.width ?? 0.6}"/>`);
  const youSvg = you ? (() => {
    const [x, y] = project(you.lat, you.lon);
    return `<g class="you">${dot(x, y, 2.5, '', 'you')}${dot(x, y, 5, 'ping')}</g>`;
  })() : '';
  return `<div class="map-wrap">${zoomable ? ZOOM_CONTROLS : ''}<svg class="worldmap" viewBox="0 0 360 180" role="img" aria-label="${esc(label)}">
    <path d="${LAND_PATH}" class="land"/><path d="${BORDERS_PATH}" class="borders"/>${zoomable ? LABEL_SVG : ''}
    ${arcSvg.join('')}${dotSvg.join('')}${youSvg}
  </svg></div>`;
}
