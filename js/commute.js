// Commute panel: door-to-door public transport (trains, buses, trams, metro) from Transitous,
// a free community-run journey planner for Europe (https://transitous.org, no key, CORS allowed).
// Your addresses are typed once in the setup form and saved in MIAP's private database (our Worker,
// behind the Access login), so every device you log in from knows them. They are never in the
// public repository. Transitous does receive them, to find stops and plan trips.
import { fetchJson, sendJson } from './http.js';
import { esc } from './ui.js';
import { distanceKm } from './geo.js';

const API = 'https://api.transitous.org/api';
const SETTINGS_URL = '/settings/commute';
const ZONE = 'Europe/Brussels';

// One request at a time, across ALL panels: Transitous answers parallel bursts with HTTP 429
// (without a CORS header, so the browser only says "Failed to fetch").
let queue = Promise.resolve();
function transitous(url) {
  const answer = queue.then(() => fetchJson(url));
  queue = answer.catch(() => {}); // a failed request must not block the next one; its error still reaches the caller
  return answer;
}

// --- addresses -> coordinates
export function geocodeUrl(text) {
  return `${API}/v1/geocode?${new URLSearchParams({ text, language: 'en' })}`;
}

export function parseGeocode(json, typed) {
  if (!Array.isArray(json)) throw new Error('Unexpected Transitous geocode response');
  const hit = json[0];
  if (!hit) throw new Error(`Address not found: "${typed}"`);
  const area = hit.areas?.find((a) => a.default)?.name;
  return { name: area && !hit.name.includes(area) ? `${hit.name}, ${area}` : hit.name, lat: hit.lat, lon: hit.lon };
}

export async function geocode(text) {
  if (text.trim().length < 3) throw new Error('Type a full address');
  return parseGeocode(await transitous(geocodeUrl(text.trim())), text);
}

// --- coordinates -> nearest address
export function reverseUrl(here) {
  return `${API}/v1/reverse-geocode?${new URLSearchParams({ place: `${here.lat.toFixed(5)},${here.lon.toFixed(5)}` })}`;
}

export function parseReverse(json) {
  if (!Array.isArray(json)) throw new Error('Unexpected Transitous reverse-geocode response');
  const hit = json.find((h) => h.type === 'ADDRESS') ?? json[0];
  return hit ? parseGeocode([hit], '').name : 'No address nearby';
}

// --- settings: { home: place, works: [{ label, place }, { label, place }] }, place = { name, lat, lon }
export function parseConfig(c) {
  const isPlace = (p) => typeof p?.name === 'string' && Number.isFinite(p?.lat) && Number.isFinite(p?.lon);
  if (!isPlace(c?.home)) throw new Error('Commute setup: home address missing');
  if (!Array.isArray(c.works) || c.works.length !== 2 || c.works.some((w) => !w.label || !isPlace(w.place))) {
    throw new Error('Commute setup: both workplaces need a name and an address');
  }
  return c;
}

// null until the setup form has been saved once
export async function readConfig() {
  const saved = await fetchJson(SETTINGS_URL);
  return saved === null ? null : parseConfig(saved);
}

export async function saveConfig(config) {
  return parseConfig(await sendJson(SETTINGS_URL, 'PUT', parseConfig(config)));
}

// The four routes, in the order they are shown. start: where the trips to work begin,
// { label: 'Here', place: your GPS fix } on the page, { label: 'Home', place: home } for the alerts.
export function routes(config, start) {
  const [w1, w2] = config.works;
  return [
    { label: `${start.label} → ${w1.label}`, from: start.place, to: w1.place },
    { label: `${start.label} → ${w2.label}`, from: start.place, to: w2.place },
    { label: `${w1.label} → Home`, from: w1.place, to: config.home },
    { label: `${w2.label} → Home`, from: w2.place, to: config.home },
  ];
}

// --- trips
// count: how many upcoming trips to ask for
export function planUrl(from, to, count) {
  const at = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  return `${API}/v5/plan?${new URLSearchParams({ fromPlace: at(from), toPlace: at(to), numItineraries: String(count) })}`;
}

const RAIL = new Set(['RAIL', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN', 'LONG_DISTANCE', 'HIGHSPEED_RAIL', 'NIGHT_RAIL']);
const minutes = (ms) => Math.round(ms / 60000);

function legLabel(leg) {
  if (leg.mode === 'WALK') return `walk ${minutes(new Date(leg.endTime) - new Date(leg.startTime))}'`;
  const kind = RAIL.has(leg.mode) ? 'train' : leg.mode === 'SUBWAY' || leg.mode === 'METRO' ? 'metro' : leg.mode.toLowerCase();
  return `${kind} ${leg.routeShortName ?? ''}`.trim();
}

// Live data: a transit leg's startTime includes its delay, scheduledStartTime does not.
export function parsePlan(json) {
  if (!Array.isArray(json?.itineraries)) throw new Error('Unexpected Transitous plan response');
  return json.itineraries.map((it) => {
    const transit = it.legs.filter((l) => l.mode !== 'WALK');
    const first = transit[0];
    return {
      start: new Date(it.startTime),
      end: new Date(it.endTime),
      durationMin: minutes(new Date(it.endTime) - new Date(it.startTime)),
      delayMin: first ? Math.max(0, minutes(new Date(first.startTime) - new Date(first.scheduledStartTime))) : 0,
      cancelled: it.legs.some((l) => l.cancelled === true || l.from?.cancelled === true),
      legs: it.legs.map(legLabel),
      // for alerts: when the first vehicle was due (stable even when it runs late), and the stops used
      scheduled: first ? new Date(first.scheduledStartTime) : new Date(it.startTime),
      stops: transit.flatMap((l) => [l.from?.name, l.to?.name]).filter(Boolean),
    };
  });
}

const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(d);

export function renderRoute(label, trips, now) {
  const next = trips.find((t) => !t.cancelled && t.start >= now - 60000);
  const head = next
    ? (() => {
        const inMin = minutes(next.start - now);
        const cls = inMin <= 5 ? 'warm' : '';
        return `<div class="leave ${cls}">${inMin <= 1 ? 'Leave now' : `Leave in ${inMin} min`}</div>
          <div class="dim">${next.durationMin} min, there at ${hhmm(next.end)}</div>`;
      })()
    : '<div class="dim">No trip found right now</div>';
  const rows = trips.map((t) => {
    const delay = t.delayMin > 0 ? ` <span class="warm">+${t.delayMin}</span>` : '';
    const status = t.cancelled ? ' <span class="hot">Cancelled</span>' : '';
    return `<li${t.cancelled ? ' class="dim"' : ''}><span class="t">${hhmm(t.start)}${delay} → ${hhmm(t.end)}${status}</span>
      <span class="dim">${t.durationMin} min</span><span class="legs">${t.legs.map(esc).join(' › ')}</span></li>`;
  });
  return `<div class="route-block"><h3>${esc(label)}</h3>${head}<ul class="trips">${rows.join('')}</ul></div>`;
}

// The commute panel shows the FASTEST_SHOWN quickest of the next CANDIDATES trips (cancelled and
// already-gone ones left out), in departure order.
const CANDIDATES = 6;
const FASTEST_SHOWN = 2;
const THERE_KM = 0.2;

export function fastest(trips, now, n = FASTEST_SHOWN) {
  return trips
    .filter((t) => !t.cancelled && t.start >= now - 60000)
    .sort((a, b) => a.durationMin - b.durationMin || a.start - b.start)
    .slice(0, n)
    .sort((a, b) => a.start - b.start);
}

// Trouble on a trip = cancelled, or its first vehicle runs DELAY_MIN+ late (the phone alerts use the same rule).
export const DELAY_MIN = 5;
const SOON_MS = 60 * 60 * 1000;

// Trips leaving in the next hour (or that left in the last 2 minutes).
export function soon(trips, now) {
  return trips.filter((t) => t.start - now > -2 * 60000 && t.start - now < SOON_MS);
}

// Work commute days: Monday to Friday, Brussels time.
export function isWeekend(now) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short' }).format(now);
  return day === 'Sat' || day === 'Sun';
}

// here: your current GPS fix; the trips to work start there, the trips home start at work.
// One load feeds both the Commute tab and the Today card: per route, all planned trips (or "you're there").
export async function loadCommute(config, here) {
  const plans = [];
  for (const r of routes(config, { label: 'Here', place: here })) {
    const there = distanceKm(r.from.lat, r.from.lon, r.to.lat, r.to.lon) < THERE_KM;
    plans.push({ label: r.label, there, trips: there ? [] : parsePlan(await transitous(planUrl(r.from, r.to, CANDIDATES))) });
  }
  return plans;
}

// Commute tab: the same verdict as the Today card, then every route.
export function renderCommute(plans, now) {
  return commuteVerdict(plans, now) + plans
    .map((p) => (p.there ? `<h3>${esc(p.label)}</h3><p class="leave">You're there.</p>` : renderRoute(p.label, fastest(p.trips, now), now)))
    .join('');
}

// Today card: the verdict, then the next departure on the two routes that matter now.
function brusselsHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

// "08:10 train S2 to Office A is cancelled" / "... runs 7 min late"
function trouble(label, t) {
  const what = `${hhmm(t.scheduled)} ${t.legs.filter((l) => !l.startsWith('walk')).join(' › ')} to ${label.split(' → ')[1]}`;
  return t.cancelled ? `${what} is cancelled` : `${what} runs ${t.delayMin} min late`;
}

// The routes that matter now: to work before noon, home after (like the phone alerts).
const watchedNow = (plans, now) => (brusselsHour(now) < 12 ? plans.slice(0, 2) : plans.slice(2, 4));

// One sentence: what is wrong on the trips you would take next, or that nothing is.
export function commuteVerdict(plans, now) {
  if (isWeekend(now)) return '<p class="verdict">Weekend: no work commute today.</p>';
  const watched = watchedNow(plans, now);
  const problems = watched.flatMap((p) => soon(p.trips, now).filter((t) => t.cancelled || t.delayMin >= DELAY_MIN).map((t) => trouble(p.label, t)));
  if (problems.length) {
    return `<p class="verdict warm">${esc(problems[0])}${problems.length > 1 ? `, and ${problems.length - 1} more problem${problems.length > 2 ? 's' : ''}` : ''}.</p>`;
  }
  const leaving = watched.some((p) => soon(p.trips, now).length);
  return `<p class="verdict${leaving ? ' ok' : ''}">${leaving ? 'No delays or cancellations on your next trips.' : 'No trips in the next hour.'}</p>`;
}

export function commuteSummary(plans, now) {
  const link = '<a class="more-link" href="#commute">All routes ›</a>';
  if (isWeekend(now)) return commuteVerdict(plans, now) + link;
  const rows = watchedNow(plans, now).map((p) => {
    if (p.there) return `<li><span class="route">${esc(p.label)}</span><span>You're there.</span></li>`;
    const next = fastest(p.trips, now)[0];
    if (!next) return `<li><span class="route">${esc(p.label)}</span><span class="dim">No trip found right now</span></li>`;
    const inMin = minutes(next.start - now);
    const cls = inMin <= 5 ? 'warm' : '';
    return `<li><span class="route">${esc(p.label)}</span><span class="${cls}">${inMin <= 1 ? 'Leave now' : `Leave in ${inMin} min`}</span>
      <span class="dim">${next.durationMin} min · there ${hhmm(next.end)}</span></li>`;
  });
  return `${commuteVerdict(plans, now)}<ul class="next-trips">${rows.join('')}</ul>${link}`;
}

// --- "where am I": your phone's GPS fix, the nearest address and the way home from there.
// The position goes to Transitous for the address and the trip, and is never stored.
export function renderHere(here, address, home, trips, now) {
  const km = distanceKm(here.lat, here.lon, home.lat, home.lon);
  const fix = `${here.lat.toFixed(5)}, ${here.lon.toFixed(5)} · ±${Math.round(here.accuracy)} m`;
  const top = `<div class="place-name">${esc(address)}</div><div class="dim small"><span class="fix">${fix}</span> · ${km.toFixed(1)} km from home</div>`;
  if (km < THERE_KM) return `${top}<p class="leave">You're home.</p>`;
  return top + renderRoute('Here → Home', trips, now);
}

export async function loadHere(here, home, now) {
  const address = parseReverse(await transitous(reverseUrl(here)));
  const trips = distanceKm(here.lat, here.lon, home.lat, home.lon) < THERE_KM ? [] : parsePlan(await transitous(planUrl(here, home, 3)));
  return renderHere(here, address, home, trips, now);
}
