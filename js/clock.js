// Clock panel: local time, UTC, today's date and the ISO week number.
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

export function renderClock(now) {
  const w = isoWeek(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `
    <div class="big">${esc(now.toLocaleTimeString('en-GB', { hour12: false }))}</div>
    <table>
      <tr><td>UTC</td><td>${now.toISOString().slice(11, 19)}</td></tr>
      <tr><td>DATE</td><td>${esc(date)}</td></tr>
      <tr><td>WEEK</td><td>Week ${w.week} of ${w.year}</td></tr>
    </table>`;
}
