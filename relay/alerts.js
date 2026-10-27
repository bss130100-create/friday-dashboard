// What MIAP pushes to your phone, and when. Called from the Worker's cron jobs.
//   Every 5 min, weekdays 08:00-09:00 (to work) and 15:30-17:30 (home), Brussels time:
//     a trip in the next hour on your routes is cancelled, runs 5+ min late, or an SNCB disruption
//     names a station it uses.
//   Every hour: an M5+ earthquake within 500 km of home in the last 2 hours.
// Each event is pushed once (remembered in the alerts_sent table for 3 days).
import { routes, planUrl, parsePlan, soon, DELAY_MIN } from '../js/commute.js';
import { DISTURBANCES_URL, parseDisturbances, placesIn, normalize } from '../js/rail.js';
import { distanceKm } from '../js/geo.js';

const ZONE = 'Europe/Brussels';
export const WINDOWS = { morning: [8 * 60, 9 * 60], evening: [15 * 60 + 30, 17 * 60 + 30] };
const QUAKE_MAG = 5;
const QUAKE_KM = 500;

const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(d);

// 'morning', 'evening' or null (weekends and outside the windows)
export function commuteWindow(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return null;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return Object.keys(WINDOWS).find((w) => minute >= WINDOWS[w][0] && minute < WINDOWS[w][1]) ?? null;
}

// The two routes to watch in a window: to work in the morning, home in the evening.
export function watchedRoutes(config, window) {
  const all = routes(config, { label: 'Home', place: config.home }); // the Worker has no GPS: alerts start from home
  return window === 'morning' ? all.slice(0, 2) : all.slice(2, 4);
}

// Events for one route: trips leaving within the next hour, plus disruptions on their stations.
export function tripEvents(label, trips, disruptions, now) {
  const leaving = soon(trips, now);
  const events = [];
  for (const t of leaving) {
    const what = `${hhmm(t.scheduled)} ${t.legs.filter((l) => !l.startsWith('walk')).join(' › ')}`;
    if (t.cancelled) events.push({ key: `cancel|${label}|${t.scheduled.toISOString()}`, title: `Cancelled · ${label}`, body: `${what} is cancelled. Open MIAP for the next option.` });
    else if (t.delayMin >= DELAY_MIN) events.push({ key: `delay|${label}|${t.scheduled.toISOString()}`, title: `+${t.delayMin} min · ${label}`, body: `${what} now leaves at ${hhmm(t.start)}.` });
  }
  const stops = new Set(leaving.flatMap((t) => t.stops.flatMap((s) => s.split('/')).map(normalize)));
  for (const d of disruptions) {
    if (!d.planned && placesIn(d.title).some((p) => stops.has(p))) {
      events.push({ key: `rail|${d.title}|${d.time.toISOString()}`, title: `SNCB disruption · ${label}`, body: d.title });
    }
  }
  return events;
}

export function quakeEvents(geojson, home, now) {
  return geojson.features
    .filter((q) => q.properties.mag >= QUAKE_MAG && now - q.properties.time < 2 * 3600000)
    .map((q) => ({ q, km: distanceKm(home.lat, home.lon, q.geometry.coordinates[1], q.geometry.coordinates[0]) }))
    .filter(({ km }) => km <= QUAKE_KM)
    .map(({ q, km }) => ({ key: `quake|${q.id}`, title: `M${q.properties.mag.toFixed(1)} earthquake, ${Math.round(km)} km away`, body: q.properties.place }));
}

// Transitous and iRail are asked one request at a time, like on the page.
export async function commuteEvents(config, now, getJson) {
  const window = commuteWindow(now);
  if (!window) return [];
  const disruptions = parseDisturbances(await getJson(DISTURBANCES_URL));
  const events = [];
  for (const r of watchedRoutes(config, window)) {
    events.push(...tripEvents(r.label, parsePlan(await getJson(planUrl(r.from, r.to, 3))), disruptions, now));
  }
  return events;
}
