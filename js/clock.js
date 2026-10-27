// Chronometer: local time, UTC, today's date and the ISO week number.
import { esc } from './ui.js';

// ISO 8601 week (used across Europe): weeks start on Monday, and week 1 is the week with the
// year's first Thursday. Trick: the Thursday of a date's week decides which year/week it is in.
export function isoWeek(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday); // move to that week's Thursday
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

// Compact: local time (seconds smaller), then one line with UTC, the date and the week.
export function renderClock(now) {
  const w = isoWeek(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const [hm, sec] = [now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), String(now.getSeconds()).padStart(2, '0')];
  const date = `${now.toLocaleDateString('en-GB', { weekday: 'short' })} ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `
    <div class="time">${esc(hm)}<span class="sec">:${sec}</span></div>
    <p class="tele"><span class="mono">UTC ${now.toISOString().slice(11, 19)}</span> · ${esc(date)} · Week ${w.week}</p>`;
}
