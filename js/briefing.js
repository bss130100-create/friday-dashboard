// AI briefing: collects what the main panels show right now (their text, as you see it) and asks
// our Worker (/briefing, Workers AI) for a short summary plus three short lists (updates, coming up,
// recommended actions) that open under it. Panels showing an error are left out, and so is the
// work commute on Saturdays and Sundays.
import { sendJson } from './http.js';
import { esc, expander } from './ui.js';
import { isWeekend } from './commute.js';

export const SOURCES = {
  here: 'Where I am', commute: 'Commute', traffic: 'Roads & rail', weather: 'Weather', air: 'Air quality',
  astro: 'Sun & moon', daysoff: 'Days off', holidays: 'Holidays', power: 'Electricity prices', news: 'News',
  topic: 'Topic of the week',
};
const MAX_PER_PANEL = 500;
const WEEKDAY_ONLY = new Set(['commute']); // routes to and from work

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

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// brief = { summary, updates, upcoming, actions } from the Worker
export function renderBriefing(brief, panelCount) {
  const group = (title, items) => (items.length ? `<h3>${title}</h3><ul class="brief-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
  const details = group('Updates', brief.updates) + group('Coming up', brief.upcoming) + group('Recommended', brief.actions);
  const counts = [
    brief.updates.length && plural(brief.updates.length, 'update'),
    brief.upcoming.length && `${brief.upcoming.length} coming up`,
    brief.actions.length && plural(brief.actions.length, 'action'),
  ].filter(Boolean);
  return `<p class="brief">${esc(brief.summary)}</p>
    ${details ? expander(details, counts.join(' · ')) : ''}
    <p class="source">from ${plural(panelCount, 'panel')} · Workers AI</p>`;
}

export async function loadBriefing(panels, now) {
  const count = Object.keys(panels).length;
  if (!count) throw new Error('No panel data yet to brief on');
  return renderBriefing(await sendJson('/briefing', 'POST', { now: localNow(now), panels }), count);
}
