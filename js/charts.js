// Tiny SVG charts for the trends panel: one series, one hue, thin marks, a recessive baseline.
// Every day has an invisible full-height hover strip with a <title>, so hovering (or a long
// press on the phone) shows that day's exact value.
import { esc } from './ui.js';

const W = 300;
const f = (n) => n.toFixed(1);

// points: [{ label, value }] oldest first. Returns an SVG line chart (sparkline-sized).
export function lineChart(points, { height = 48, unit = '' } = {}) {
  if (points.length < 2) return '<p class="dim small">collecting… a line needs 2+ days</p>';
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = W / (points.length - 1);
  const xy = points.map((p, i) => [i * step, height - 2 - (p.value / max) * (height - 6)]);
  const hover = points.map((p, i) => `<rect x="${f(i * step - step / 2)}" y="0" width="${f(step)}" height="${height}" class="hit"><title>${esc(p.label)}: ${esc(String(p.value))}${unit}</title></rect>`);
  const [lx, ly] = xy[xy.length - 1];
  return `<svg class="chart" viewBox="0 -2 ${W} ${height + 2}" role="img" aria-label="trend">
    <line x1="0" y1="${height}" x2="${W}" y2="${height}" class="base"/>
    <path d="M${xy.map(([x, y]) => `${f(x)},${f(y)}`).join('L')}" class="line"/>
    <circle cx="${f(lx)}" cy="${f(ly)}" r="2.5" class="end"/>${hover.join('')}</svg>`;
}

// points: [{ label, value }] oldest first. Returns an SVG bar chart.
export function barChart(points, { height = 56, unit = '' } = {}) {
  if (points.length === 0) return '<p class="dim small">no data yet</p>';
  const max = Math.max(...points.map((p) => p.value), 1);
  const slot = W / points.length;
  const gap = Math.min(2, slot * 0.3);
  const bars = points.map((p, i) => {
    const h = Math.max(1, (p.value / max) * (height - 4));
    return `<rect x="${f(i * slot + gap / 2)}" y="${f(height - h)}" width="${f(slot - gap)}" height="${f(h)}" class="col"/>`
      + `<rect x="${f(i * slot)}" y="0" width="${f(slot)}" height="${height}" class="hit"><title>${esc(p.label)}: ${esc(String(p.value))}${unit}</title></rect>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="daily bars">
    <line x1="0" y1="${height}" x2="${W}" y2="${height}" class="base"/>${bars.join('')}</svg>`;
}
