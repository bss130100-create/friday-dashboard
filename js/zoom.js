// Zoom & pan for the world maps (viewBox 0 0 360 180, see worldmap.js).
//
// How it works: an SVG "viewBox" is the window onto the drawing. Showing a smaller window
// of the same drawing = zooming in; sliding the window = panning. Dots and attack arcs are
// re-sized on each zoom so they stay the same size on screen.
//
// Country names are kept at a readable size and appear as countries get big enough on screen.
//
// Controls: + / − / reset buttons, double-click, drag (when zoomed), two-finger pinch
// (phone), pinch or Ctrl/⌘ + scroll (laptop trackpad / mouse).

export const FULL = Object.freeze({ x: 0, y: 0, w: 360, h: 180 });
const MAX_ZOOM = 16;
const LABEL_PX = 10; // country name size on screen
const LABEL_MIN_COUNTRY_PX = 28; // label a country once it is at least this wide on screen

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function zoomLevel(view) {
  return FULL.w / view.w;
}

// Keep the window inside the map and between 1x and MAX_ZOOM.
export function clampView({ x, y, w }) {
  const width = clamp(w, FULL.w / MAX_ZOOM, FULL.w);
  const height = width / 2;
  return { x: clamp(x, 0, FULL.w - width), y: clamp(y, 0, FULL.h - height), w: width, h: height };
}

// Zoom by `factor` (>1 = in) keeping map point (px, py) fixed under the finger/cursor.
export function zoomAt(view, factor, px, py) {
  const w = clamp(view.w / factor, FULL.w / MAX_ZOOM, FULL.w);
  const k = w / view.w;
  return clampView({ x: px - (px - view.x) * k, y: py - (py - view.y) * k, w });
}

// Move the window by (dx, dy) map units.
export function panBy(view, dx, dy) {
  return clampView({ x: view.x + dx, y: view.y + dy, w: view.w });
}

// Rough box around a centred label (monospace font: each character is about 0.6 em wide).
export function labelBox(x, y, chars, fontSize) {
  const w = chars * 0.6 * fontSize;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - fontSize / 2, y1: y + fontSize / 2 };
}

export function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// Browser part: wire zoom to one panel. The panel's map is re-drawn on every data refresh,
// so the current view is kept here and re-applied whenever the panel body changes.
export function makeZoomable(sectionId) {
  const body = document.getElementById(sectionId)?.querySelector('.body');
  if (!body) throw new Error(`Panel #${sectionId} missing from index.html`);
  let view = FULL;
  const svg = () => body.querySelector('svg.worldmap');

  function apply() {
    const map = svg();
    if (!map) return;
    map.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const inv = view.w / FULL.w;
    for (const c of map.querySelectorAll('circle[data-r]')) c.setAttribute('r', (c.dataset.r * inv).toFixed(3));
    for (const a of map.querySelectorAll('path[data-w]')) {
      a.style.strokeWidth = (a.dataset.w * inv).toFixed(3);
      a.style.strokeDasharray = `${(3 * inv).toFixed(3)} ${(2 * inv).toFixed(3)}`;
    }
    // Country names: constant size on screen, shown when the country is wide enough to hold one.
    const pxPerUnit = map.getBoundingClientRect().width / view.w;
    // Labels come biggest country first; a label that would overlap one already shown is skipped.
    if (pxPerUnit > 0) {
      const fontSize = LABEL_PX / pxPerUnit;
      const placed = [];
      for (const t of map.querySelectorAll('.labels text')) {
        t.setAttribute('font-size', fontSize.toFixed(3));
        const box = labelBox(Number(t.getAttribute('x')), Number(t.getAttribute('y')), t.textContent.length, fontSize);
        const show = t.dataset.span * pxPerUnit >= LABEL_MIN_COUNTRY_PX && !placed.some((b) => overlaps(b, box));
        if (show) placed.push(box);
        t.classList.toggle('show', show);
      }
    }
    map.classList.toggle('zoomed', zoomLevel(view) > 1.01);
    const label = body.querySelector('.zoom-level');
    if (label) label.textContent = `${zoomLevel(view).toFixed(1)}×`;
  }
  const set = (next) => { view = next; apply(); };

  // screen pixel -> map units
  function toMap(clientX, clientY) {
    const r = svg().getBoundingClientRect();
    return [view.x + ((clientX - r.left) / r.width) * view.w, view.y + ((clientY - r.top) / r.height) * view.h];
  }
  const centre = () => [view.x + view.w / 2, view.y + view.h / 2];

  new MutationObserver(apply).observe(body, { childList: true });
  // Label sizes depend on the map's width on screen: redo them when it changes, including when
  // its tab opens (a hidden map has width 0, so its labels wait until then).
  new ResizeObserver(apply).observe(body);

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zoom]');
    if (!btn) return;
    if (btn.dataset.zoom === 'in') set(zoomAt(view, 2, ...centre()));
    if (btn.dataset.zoom === 'out') set(zoomAt(view, 0.5, ...centre()));
    if (btn.dataset.zoom === 'reset') set(FULL);
  });

  body.addEventListener('dblclick', (e) => {
    if (!e.target.closest('svg.worldmap')) return;
    set(zoomAt(view, 2, ...toMap(e.clientX, e.clientY)));
  });

  // Trackpad pinch arrives as wheel + ctrlKey. Plain scrolling keeps scrolling the page.
  body.addEventListener('wheel', (e) => {
    if (!e.target.closest('svg.worldmap') || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    set(zoomAt(view, Math.exp(-e.deltaY * 0.01), ...toMap(e.clientX, e.clientY)));
  }, { passive: false });

  // Drag + pinch with pointer events (mouse, pen and touch alike).
  const pointers = new Map();
  body.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('svg.worldmap')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  body.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const map = svg();
    if (pointers.size === 1 && zoomLevel(view) > 1.01) {
      const r = map.getBoundingClientRect();
      set(panBy(view, -((e.clientX - prev.x) / r.width) * view.w, -((e.clientY - prev.y) / r.height) * view.h));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.entries()].map(([id, p]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : p));
      const [pa, pb] = [...pointers.values()];
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (Number.isFinite(ratio) && ratio > 0) set(zoomAt(view, ratio, ...toMap((a.x + b.x) / 2, (a.y + b.y) / 2)));
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    body.addEventListener(type, (e) => pointers.delete(e.pointerId));
  }
}
