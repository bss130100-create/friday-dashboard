// Panels pack upwards like bricks: a short panel sits right under the one above it, instead of
// waiting for the tallest panel of that row. The grid's rows are 1px tall (style.css); each panel
// spans as many as its own height plus the gap below it, and is re-measured when its content changes.

export const PANEL_GAP_PX = 14;

export function rowSpan(heightPx, gapPx = PANEL_GAP_PX) {
  return Math.max(1, Math.ceil(heightPx + gapPx));
}

export function packPanels(main) {
  const fit = (section) => { section.style.gridRowEnd = `span ${rowSpan(section.getBoundingClientRect().height)}`; };
  const observer = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
  for (const section of main.querySelectorAll(':scope > section')) observer.observe(section);
}
