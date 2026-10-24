// AI briefing: collects what the main panels show right now (their text, as you see it) and asks
// our Worker (/briefing, Workers AI) for 2-3 sentences. Panels showing an error are left out,
// and so is the work commute on Saturdays and Sundays.
import { sendJson } from './http.js';
import { esc } from './ui.js';

export const SOURCES = {
  here: 'Where I am', commute: 'Commute', traffic: 'Roads & rail', weather: 'Weather', air: 'Air quality',
  astro: 'Sun & moon', quakes: 'Earthquakes', news: 'News', topic: 'Topic of the week',
};
const MAX_PER_PANEL = 500;
const WEEKDAY_ONLY = new Set(['commute']); // routes to and from work

export function isWeekend(now) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short' }).format(now);
  return day === 'Sat' || day === 'Sun';
}

export function readouts(doc, now) {
  const out = {};
  for (const [id, name] of Object.entries(SOURCES)) {
    if (WEEKDAY_ONLY.has(id) && isWeekend(now)) continue;
    const section = doc.getElementById(id);
    if (!section || section.classList.contains('error')) continue;
    const text = section.querySelector('.body').textContent.replace(/\s+/g, ' ').trim();
    if (text && !text.endsWith('…')) out[name] = text.slice(0, MAX_PER_PANEL); // "…" = still loading
  }
  return out;
}

export function localNow(now) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(now);
}

export async function loadBriefing(panels, now) {
  if (!Object.keys(panels).length) throw new Error('No panel data yet to brief on');
  const { text } = await sendJson('/briefing', 'POST', { now: localNow(now), panels });
  return `<p class="brief">${esc(text)}</p><p class="dim small">from ${Object.keys(panels).length} panels · Workers AI</p>`;
}
