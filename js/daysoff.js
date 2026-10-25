// Days-off planner: Belgian public holidays for the next 12 months, which ones make a long weekend
// (or one with a single day of leave), and the French- and Dutch-speaking school holidays
// (both run in Brussels; trains and roads are quieter during them).
// Source: OpenHolidays API (free, no key, open to browsers).
import { fetchJson } from './http.js';
import { esc } from './ui.js';

const API = 'https://openholidaysapi.org';
const DAY_MS = 24 * 60 * 60 * 1000;
const COMMUNITIES = { 'BE-FR': 'FR schools', 'BE-NL': 'NL schools' };

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
    case 1: return { long: true, leave: 0, text: 'long weekend, Sat–Mon' };
    case 5: return { long: true, leave: 0, text: 'long weekend, Fri–Sun' };
    case 2: return { long: true, leave: 1, text: `take ${pretty(addDays(date, -1))} off: 4 days, Sat–Tue` };
    case 4: return { long: true, leave: 1, text: `take ${pretty(addDays(date, 1))} off: 4 days, Thu–Sun` };
    case 3: return { long: false, leave: 0, text: 'midweek day off' };
    default: return { long: false, leave: 0, text: 'weekend: you get a replacement day (your employer sets it)' };
  }
}

// School holidays per community: the one running today, else the next one.
export function schoolStatus(school, today) {
  return Object.entries(COMMUNITIES).map(([code, label]) => {
    const mine = school.filter((h) => h.groups.includes(code) && h.end >= today).sort((a, b) => a.start.localeCompare(b.start));
    const h = mine[0];
    if (!h) return { label, text: 'no dates published yet' };
    if (h.start <= today) return { label, text: `${h.name} now, until ${pretty(h.end)}` };
    const span = h.start === h.end ? pretty(h.start) : `${pretty(h.start)} – ${pretty(h.end)}`;
    return { label, text: `${h.name}: ${span} (in ${daysBetween(today, h.start)} days)` };
  });
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

export function renderDaysOff({ today, publicDays, school }) {
  const upcoming = publicDays
    .filter((h) => h.start >= today && !NOT_A_DAY_OFF.has(h.name))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!upcoming.length) throw new Error('OpenHolidays: no public holidays in the next 12 months');
  const next = upcoming[0];
  const nextLong = upcoming.find((h) => bridge(h.start).long);
  const inDays = (date) => {
    const n = daysBetween(today, date);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  };
  const rows = upcoming.map((h) => {
    const b = bridge(h.start);
    return `<tr><td class="nowrap">${pretty(h.start)}</td><td>${esc(h.name)}</td><td class="${b.long ? '' : 'dim'}">${esc(b.text)}</td></tr>`;
  });
  return `
    <div class="gauge-row">
      <div class="big">${daysBetween(today, next.start)}<span class="unit"> days</span></div>
      <div class="dim">to ${esc(next.name)}, ${pretty(next.start)}</div>
    </div>
    ${nextLong ? `<p>Next long weekend: <strong>${esc(nextLong.name)}</strong>, ${pretty(nextLong.start)} (${inDays(nextLong.start)})${bridge(nextLong.start).leave ? `: ${esc(bridge(nextLong.start).text)}` : ''}.</p>` : ''}
    <h3>SCHOOL HOLIDAYS</h3>
    <table class="small">${schoolStatus(school, today).map((s) => `<tr><td class="nowrap">${esc(s.label)}</td><td>${esc(s.text)}</td></tr>`).join('')}</table>
    <h3>PUBLIC HOLIDAYS · NEXT 12 MONTHS</h3>
    <table class="small">${rows.join('')}</table>`;
}
