// Panel order: your own order of the cards on each tab, kept in MIAP's private database so the
// iPhone and the laptop show the same layout. Saved shape: { time: ['briefing', 'topic', ...], ... },
// one list of card ids per tab you have rearranged; a tab you never touched keeps index.html's order.
import { fetchJson, sendJson } from './http.js';

const LAYOUT_URL = '/settings/layout';

// The saved order, with the default order filling the gaps: a card that was added to MIAP after you
// saved your order lands just below the card it follows by default, and a removed card is dropped.
export function orderIds(defaults, saved = []) {
  const result = [...new Set(saved)].filter((id) => defaults.includes(id));
  defaults.forEach((id, i) => {
    if (result.includes(id)) return;
    const above = defaults.slice(0, i).reverse().find((d) => result.includes(d));
    result.splice(above ? result.indexOf(above) + 1 : 0, 0, id);
  });
  return result;
}

export function parseLayout(value) {
  if (value === null) return {}; // nothing saved yet
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Panel order: saved value is not an object');
  for (const [tab, ids] of Object.entries(value)) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new Error(`Panel order for ${tab}: not a list of card ids`);
  }
  return value;
}

export async function loadLayout() {
  return parseLayout(await fetchJson(LAYOUT_URL));
}

export async function saveLayout(layout) {
  return parseLayout(await sendJson(LAYOUT_URL, 'PUT', layout));
}
