// Shared world map used by the earthquake, jamming, outage and attack panels.
// Equirectangular projection: longitude -> x, latitude -> y (viewBox 0 0 360 180).
import { LAND_PATH } from './worldmap-data.js';
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

// dots: [{ lat, lon, r, cls, title }], arcs: [{ from: [lat, lon], to: [lat, lon], cls, width }], you: { lat, lon }
export function worldMap({ dots = [], arcs = [], you = null, label = 'world map' }) {
  const dotSvg = dots.map((d) => {
    const [x, y] = project(d.lat, d.lon);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${d.r ?? 1.5}" class="${d.cls ?? ''}">${d.title ? `<title>${esc(d.title)}</title>` : ''}</circle>`;
  });
  const arcSvg = arcs.map((a) => `<path d="${arcPath(a.from, a.to)}" class="arc ${a.cls ?? ''}" style="stroke-width:${a.width ?? 0.6}"/>`);
  const youSvg = you ? (() => {
    const [x, y] = project(you.lat, you.lon);
    return `<g class="you"><circle cx="${f(x)}" cy="${f(y)}" r="2.5"/><circle cx="${f(x)}" cy="${f(y)}" r="5" class="ping"/></g>`;
  })() : '';
  return `<svg class="worldmap" viewBox="0 0 360 180" role="img" aria-label="${esc(label)}">
    <path d="${LAND_PATH}" class="land"/>
    <line x1="0" y1="90" x2="360" y2="90" class="grid"/><line x1="180" y1="0" x2="180" y2="180" class="grid"/>
    ${arcSvg.join('')}${dotSvg.join('')}${youSvg}
    <rect x="0" y="0" width="2" height="180" class="sweep"/>
  </svg>`;
}
