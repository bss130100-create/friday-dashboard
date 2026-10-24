// Clock panel: local time, UTC, GPS time, GPS week and time-of-week.
//
// GPS time started at 1980-01-06 00:00:00 UTC and NEVER adds leap seconds.
// UTC has added 18 leap seconds since then, so GPS time runs 18 s ahead of UTC.
// (Last leap second: 2016-12-31. If IERS announces a new one, bump this.)
import { esc } from './ui.js';

export const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
export const GPS_UTC_LEAP_SECONDS = 18;
const SECONDS_PER_WEEK = 7 * 24 * 3600;

export function gpsTime(date) {
  const gpsMs = date.getTime() + GPS_UTC_LEAP_SECONDS * 1000;
  const secondsSinceEpoch = Math.floor((gpsMs - GPS_EPOCH_MS) / 1000);
  const week = Math.floor(secondsSinceEpoch / SECONDS_PER_WEEK);
  return {
    gpsDate: new Date(gpsMs),          // wall-clock reading of a GPS clock
    week,                               // full week number
    week10bit: week % 1024,             // what old receivers broadcast (rolls over every ~19.6 years)
    timeOfWeek: secondsSinceEpoch % SECONDS_PER_WEEK, // seconds since Sunday 00:00 GPS
  };
}

const hms = (d) => d.toISOString().slice(11, 19);

export function renderClock(now) {
  const g = gpsTime(now);
  return `
    <div class="big">${esc(now.toLocaleTimeString([], { hour12: false }))}</div>
    <table>
      <tr><td>UTC</td><td>${hms(now)}  ${now.toISOString().slice(0, 10)}</td></tr>
      <tr><td>GPS</td><td>${hms(g.gpsDate)}  (UTC+${GPS_UTC_LEAP_SECONDS}s)</td></tr>
      <tr><td>GPS WEEK</td><td>${g.week}  [10-bit: ${g.week10bit}]</td></tr>
      <tr><td>TOW</td><td>${g.timeOfWeek} s</td></tr>
      <tr><td>UNIX</td><td>${Math.floor(now.getTime() / 1000)}</td></tr>
    </table>`;
}
