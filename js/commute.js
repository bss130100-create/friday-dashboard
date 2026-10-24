// Commute panel: door-to-door public transport (trains, buses, trams, metro) from Transitous,
// a free community-run journey planner for Europe (https://transitous.org, no key, CORS allowed).
// Your addresses are typed once in the setup form and saved in MIAP's private database (our Worker,
// behind the Access login), so every device you log in from knows them. They are never in the
// public repository. Transitous does receive them, to find stops and plan trips.
import { fetchJson, putJson } from './http.js';
import { esc } from './ui.js';

const API = 'https://api.transitous.org/api';
const SETTINGS_URL = '/settings/commute';
const ZONE = 'Europe/Brussels';

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
  return parseGeocode(await fetchJson(geocodeUrl(text.trim())), text);
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
  return parseConfig(await putJson(SETTINGS_URL, parseConfig(config)));
}

// The four routes, in the order they are shown.
export function routes(config) {
  const [w1, w2] = config.works;
  return [
    { label: `Home → ${w1.label}`, from: config.home, to: w1.place },
    { label: `Home → ${w2.label}`, from: config.home, to: w2.place },
    { label: `${w1.label} → Home`, from: w1.place, to: config.home },
    { label: `${w2.label} → Home`, from: w2.place, to: config.home },
  ];
}

// --- trips
export function planUrl(from, to) {
  const at = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  return `${API}/v5/plan?${new URLSearchParams({ fromPlace: at(from), toPlace: at(to), numItineraries: '3' })}`;
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
    };
  });
}

const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(d);

export function renderRoute(label, trips, now) {
  const next = trips.find((t) => !t.cancelled && t.start >= now - 60000);
  const head = next
    ? (() => {
        const inMin = minutes(next.start - now);
        const cls = inMin <= 5 ? 'hot' : inMin <= 15 ? 'warm' : '';
        return `<div><span class="leave ${cls}">${inMin <= 1 ? 'LEAVE NOW' : `leave in ${inMin} min`}</span>
          <span class="dim">· ${next.durationMin} min, there at ${hhmm(next.end)}</span></div>`;
      })()
    : '<div class="dim">no trip found right now</div>';
  const rows = trips.map((t) => {
    const delay = t.delayMin > 0 ? ` <span class="warm">+${t.delayMin}</span>` : '';
    const status = t.cancelled ? ' <span class="hot">CANCELLED</span>' : '';
    return `<li${t.cancelled ? ' class="dim"' : ''}><span class="t">${hhmm(t.start)}${delay} → ${hhmm(t.end)}</span>
      <span class="dim">${t.durationMin}'</span>${status}<br><span class="legs">${t.legs.map(esc).join(' › ')}</span></li>`;
  });
  return `<h3>&gt; ${esc(label)}</h3>${head}<ul class="trips">${rows.join('')}</ul>`;
}

// One request at a time: Transitous answers parallel bursts with HTTP 429 (without a CORS
// header, so the browser only says "Failed to fetch").
export async function loadCommute(config, now) {
  const parts = [];
  for (const r of routes(config)) parts.push(renderRoute(r.label, parsePlan(await fetchJson(planUrl(r.from, r.to))), now));
  return parts.join('');
}
