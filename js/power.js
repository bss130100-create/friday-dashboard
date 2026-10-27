// Electricity panel for a fixed-price contract with a day/night (bi-horaire) meter in Brussels.
// The price per kWh is fixed, so the only thing that changes what you pay is the rate period:
// Sibelga's night rate runs 22:00-07:00 on weekdays and all day on weekends and public holidays
// (Brugel, the Brussels regulator). On top, the forecast renewable share per hour (Energy-Charts,
// via our Worker's /power) shows when the Belgian grid is greenest.
import { fetchJson } from './http.js';
import { esc, expander } from './ui.js';
import { barChart } from './charts.js';
import { brusselsToday, holidaysUrl, parseHolidays } from './daysoff.js';

const HOUR = 3600;
export const WINDOW_HOURS = 3;
const DAY_STARTS = 7;
const NIGHT_STARTS = 22;

// Brussels wall clock for a unix time: { date 'YYYY-MM-DD', hour 0-23, weekday 'Mon'... }
export function brusselsClock(t) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(t * 1000).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

// 'night' or 'day' for the hour starting at t. holidays: Set of 'YYYY-MM-DD'.
export function ratePeriod(t, holidays) {
  const { date, hour, weekday } = brusselsClock(t);
  if (weekday === 'Sat' || weekday === 'Sun' || holidays.has(date)) return 'night';
  return hour >= DAY_STARTS && hour < NIGHT_STARTS ? 'day' : 'night';
}

// The next hour (from t on) where the rate period changes, or null within a week.
export function nextSwitch(t, holidays) {
  const start = Math.floor(t / HOUR) * HOUR;
  const now = ratePeriod(start, holidays);
  for (let h = start + HOUR; h < start + 7 * 24 * HOUR; h += HOUR) {
    if (ratePeriod(h, holidays) !== now) return h;
  }
  return null;
}

// Hourly renewable shares (%) -> [{ t, share }] from the current hour on.
export function parseRenewables(json, now) {
  const r = json?.renewables;
  if (!Array.isArray(r?.share) || !Array.isArray(r?.unix_seconds)) throw new Error('/power: unexpected answer');
  const thisHour = Math.floor(now.getTime() / 1000 / HOUR) * HOUR;
  const out = r.unix_seconds
    .map((s, i) => ({ t: s - (s % HOUR), share: r.share[i] }))
    .filter((h) => h.t >= thisHour && typeof h.share === 'number');
  if (!out.length) throw new Error('No renewable forecast for the coming hours yet');
  return out;
}

// Greenest run of `hours` consecutive hours (highest average renewable share), or null.
export function greenestWindow(list, hours = WINDOW_HOURS) {
  let best = null;
  for (let i = 0; i + hours <= list.length; i++) {
    const run = list.slice(i, i + hours);
    if (run[hours - 1].t - run[0].t !== (hours - 1) * HOUR) continue; // a gap in the data
    const avg = run.reduce((sum, h) => sum + h.share, 0) / hours;
    if (!best || avg > best.avg) best = { from: run[0].t, to: run[0].t + hours * HOUR, avg };
  }
  return best;
}

const clock = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).format(t * 1000);
const day = (t) => brusselsClock(t).weekday;

export async function loadPower(now) {
  const hours = parseRenewables(await fetchJson('/power'), now);
  const holidays = parseHolidays(await fetchJson(holidaysUrl('PublicHolidays', brusselsToday(now))));
  return { now: Math.floor(now.getTime() / 1000), hours, holidays: new Set(holidays.map((h) => h.start)) };
}

export function renderPower({ now, hours, holidays }) {
  const period = ratePeriod(now, holidays);
  const change = nextSwitch(now, holidays);
  const green = greenestWindow(hours);
  const greenAtNight = green && ratePeriod(green.from, holidays) === 'night' && ratePeriod(green.to - HOUR, holidays) === 'night';
  const chart = barChart(
    hours.map((h) => ({ label: `${day(h.t)} ${clock(h.t)} · ${ratePeriod(h.t, holidays)} rate`, value: Math.round(h.share) })),
    { unit: '% renewable' },
  );
  return `
    <div class="gauge-row">
      <div class="big">${period === 'night' ? 'NIGHT' : 'DAY'}<span class="unit"> rate</span></div>
      <div class="dim">${period === 'night' ? 'cheap rate now' : 'full rate now'}${change ? ` · ${period === 'night' ? 'day' : 'night'} rate from ${esc(day(change))} ${clock(change)}` : ''}</div>
    </div>
    <table>
      <tr><td>Grid now</td><td>${Math.round(hours[0].share)}% renewable</td></tr>
      ${green ? `<tr><td class="nowrap">Greenest ${WINDOW_HOURS} h</td><td><span class="nowrap">${esc(day(green.from))} ${clock(green.from)}–${clock(green.to)}</span> · ${Math.round(green.avg)}%${greenAtNight ? ' · <span class="nowrap">night rate too</span>' : ''}</td></tr>` : ''}
    </table>
    ${expander(`<h3>RENEWABLE SHARE BY HOUR</h3>
    ${chart}
    <p class="dim small">Night rate (Sibelga): 22:00–07:00 on weekdays, all day on weekends and public holidays. Over 100% renewable = Belgium exports the surplus.</p>`, 'Hourly chart')}`;
}
