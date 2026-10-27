// Days-off planner: Belgian public holidays for the next 12 months, which ones make a long weekend
// (or one with a single day of leave), and the French- and Dutch-speaking school holidays
// (both run in Brussels; trains and roads are quieter during them).
// One Today card: the countdown to the next day off, and the full timeline behind "Show all".
// Source: OpenHolidays API (free, no key, open to browsers).
import { fetchJson } from './http.js';
import { esc, expander } from './ui.js';

const API = 'https://openholidaysapi.org';
const DAY_MS = 24 * 60 * 60 * 1000;
const COMMUNITIES = { 'BE-FR': 'FR', 'BE-NL': 'NL' };

// Today's date in Brussels as 'YYYY-MM-DD' (the holiday dates are plain dates, no time zone).
export function brusselsToday(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now);
}

const utc = (date) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date, n) => new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / DAY_MS);
const weekday = (date) => new Date(utc(date)).getUTCDay(); // 0 = Sunday
const pretty = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(utc(date));

export function holidaysUrl(kind, today) {
  const params = new URLSearchParams({ countryIsoCode: 'BE', languageIsoCode: 'EN', validFrom: today, validTo: addDays(today, 365) });
  return `${API}/${kind}?${params}`;
}

// OpenHolidays entry -> { name, start, end, groups }
export function parseHolidays(json) {
  if (!Array.isArray(json)) throw new Error('OpenHolidays: expected a list');
  return json.map((h) => ({
    name: (h.name.find((n) => n.language === 'EN') ?? h.name[0]).text,
    start: h.startDate,
    end: h.endDate,
    groups: (h.groups ?? []).map((g) => g.code),
  }));
}

// What a public holiday on this date means for a Monday-to-Friday worker.
export function bridge(date) {
  switch (weekday(date)) {
    case 1: return { long: true, leave: 0, text: 'Long weekend, Sat–Mon' };
    case 5: return { long: true, leave: 0, text: 'Long weekend, Fri–Sun' };
    case 2: return { long: true, leave: 1, text: `Take ${pretty(addDays(date, -1))} off for 4 days, Sat–Tue` };
    case 4: return { long: true, leave: 1, text: `Take ${pretty(addDays(date, 1))} off for 4 days, Thu–Sun` };
    case 3: return { long: false, leave: 0, text: 'Midweek day off' };
    default: return { long: false, leave: 0, text: 'Falls on a weekend: you get a replacement day (your employer picks it)' };
  }
}

export async function loadDaysOff(now) {
  const today = brusselsToday(now);
  const publicDays = parseHolidays(await fetchJson(holidaysUrl('PublicHolidays', today)));
  const school = parseHolidays(await fetchJson(holidaysUrl('SchoolHolidays', today)));
  return { today, publicDays, school };
}

// OpenHolidays also lists Easter and Pentecost Sunday; they are not among Belgium's 10 paid public
// holidays (Easter Monday and Whit Monday are), so they give no day off or replacement day.
const NOT_A_DAY_OFF = new Set(['Easter', 'Pentecost']);

// Public holidays from today on that give a day off, soonest first.
function upcomingDaysOff(publicDays, today) {
  return publicDays
    .filter((h) => h.start >= today && !NOT_A_DAY_OFF.has(h.name))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function inDays(today, date) {
  const n = daysBetween(today, date);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

// Compact countdown to the next day off, and the next long weekend.
export function renderDaysOff({ today, publicDays }) {
  const upcoming = upcomingDaysOff(publicDays, today);
  if (!upcoming.length) throw new Error('OpenHolidays: no public holidays in the next 12 months');
  const next = upcoming[0];
  const n = daysBetween(today, next.start);
  const nextLong = upcoming.find((h) => bridge(h.start).long);
  const count = n === 0 ? '<span class="big">Today</span>' : `<span class="big">${n}</span><span class="unit">${n === 1 ? 'day' : 'days'}</span>`;
  return `
    <div class="count">${count}</div>
    <p class="lead">${n === 0 ? '' : 'to '}<strong>${esc(next.name)}</strong> · ${pretty(next.start)}</p>
    <p class="dim small">${esc(bridge(next.start).text)}</p>
    ${nextLong && nextLong !== next ? `<p class="small">Next long weekend: <strong>${esc(nextLong.name)}</strong>, ${pretty(nextLong.start)} (${inDays(today, nextLong.start)}).${bridge(nextLong.start).leave ? ` ${esc(bridge(nextLong.start).text)}.` : ''}</p>` : ''}`;
}

// One list, soonest first: the public holidays that give a day off, and the FR and NL school
// holidays (one entry when both communities have the same dates).
export function holidayTimeline({ today, publicDays, school }) {
  const items = upcomingDaysOff(publicDays, today).map((h) => {
    const b = bridge(h.start);
    return { start: h.start, name: h.name, note: b.text, kind: b.long ? 'long' : 'day', when: inDays(today, h.start) };
  });
  const terms = new Map();
  for (const h of school.filter((x) => x.end >= today)) {
    const key = `${h.name}|${h.start}|${h.end}`;
    const term = terms.get(key) ?? { ...h, groups: [] };
    term.groups.push(...h.groups);
    terms.set(key, term);
  }
  for (const t of terms.values()) {
    const who = Object.entries(COMMUNITIES).filter(([code]) => t.groups.includes(code)).map(([, label]) => label);
    if (!who.length) continue; // e.g. only the German-speaking community
    const until = t.start === t.end ? '' : ` · until ${pretty(t.end)}`;
    items.push({ start: t.start, name: t.name, note: `${who.join(' + ')} schools${until}`, kind: 'school', when: t.start <= today ? 'now' : inDays(today, t.start) });
  }
  return items.sort((a, b) => a.start.localeCompare(b.start));
}

// The Days off card: countdown on top, every public and school holiday of the next 12 months behind "Show all".
export function renderDaysOffCard(data) {
  const items = holidayTimeline(data);
  const row = (h) => `<li class="${h.kind}${h.when === 'now' ? ' now' : ''}"><span class="when">${pretty(h.start)}</span>
    <span class="what"><strong>${esc(h.name)}</strong><span class="note">${esc(h.note)}</span></span><span class="in">${h.when}</span></li>`;
  return renderDaysOff(data) + expander(`<ol class="timeline">${items.map(row).join('')}</ol>`, `Show all ${items.length} holidays`);
}
