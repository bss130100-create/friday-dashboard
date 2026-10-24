// Commute panel: live Belgian train times from iRail (free, no key, CORS allowed).
// iRail only knows trains (SNCB/NMBS), so the walk/tram/bus at each end is a fixed number of
// minutes you enter yourself. Your stations and places are stored only in this browser,
// never in the (public) repository.
import { fetchJson } from './http.js';
import { esc } from './ui.js';

export const STATIONS_URL = 'https://api.irail.be/v1/stations/?format=json&lang=en';
const CONFIG_KEY = 'commute';
const ZONE = 'Europe/Brussels';

// --- stations (for the autocomplete and to turn a typed name into an iRail id)
export function parseStations(json) {
  if (!Array.isArray(json?.station)) throw new Error('Unexpected iRail stations response');
  return json.station.map((s) => ({ id: s.id, name: s.name, alt: s.standardname }));
}

export function findStation(stations, typed) {
  const want = typed.trim().toLowerCase();
  const hit = stations.find((s) => s.name.toLowerCase() === want || s.alt.toLowerCase() === want);
  if (!hit) throw new Error(`Unknown station "${typed}": pick one from the suggestions`);
  return { id: hit.id, name: hit.name };
}

// --- settings: { home: {id, name}, homeMin, works: [{ label, station: {id, name}, min }] }
export function parseConfig(c) {
  const isStation = (s) => typeof s?.id === 'string' && typeof s?.name === 'string';
  const isMin = (m) => Number.isInteger(m) && m >= 0 && m <= 120;
  if (!isStation(c?.home) || !isMin(c?.homeMin)) throw new Error('Commute setup: home station or minutes missing');
  if (!Array.isArray(c.works) || c.works.length === 0) throw new Error('Commute setup: add at least one workplace');
  for (const w of c.works) {
    if (!w.label || !isStation(w.station) || !isMin(w.min)) throw new Error('Commute setup: each workplace needs a name, station and minutes');
  }
  return c;
}

export function readConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw === null ? null : parseConfig(JSON.parse(raw));
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(parseConfig(config)));
}

// --- trains
export function connectionsUrl(fromId, toId) {
  const params = new URLSearchParams({ from: fromId, to: toId, format: 'json', lang: 'en', results: '3', alerts: 'false' });
  return `https://api.irail.be/v1/connections/?${params}`;
}

// iRail gives unix seconds as strings; "time" is the scheduled time, "delay" comes on top.
export function parseConnections(json) {
  if (!Array.isArray(json?.connection)) throw new Error('Unexpected iRail connections response');
  return json.connection.map((c) => {
    const at = (end) => new Date((Number(end.time) + Number(end.delay)) * 1000);
    return {
      depart: at(c.departure),
      departDelayMin: Math.round(Number(c.departure.delay) / 60),
      arrive: at(c.arrival),
      platform: c.departure.platform,
      changes: Number(c.vias?.number ?? 0),
      canceled: c.departure.canceled === '1' || c.arrival.canceled === '1',
    };
  });
}

// Morning (before 13:00 in Brussels): home -> work. Afternoon: work -> home.
export function goingToWork(now) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 13;
}

const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(d);
const plusMin = (d, m) => new Date(d.getTime() + m * 60000);

// One trip: leave the door `beforeMin` before the train, reach the door `afterMin` after it.
export function doorToDoor(conn, beforeMin, afterMin) {
  const leave = plusMin(conn.depart, -beforeMin);
  const reach = plusMin(conn.arrive, afterMin);
  return { leave, reach, totalMin: Math.round((reach - leave) / 60000) };
}

export function renderTrip(label, conns, beforeMin, afterMin, now) {
  const next = conns.filter((c) => !c.canceled && doorToDoor(c, beforeMin, afterMin).leave >= now);
  const head = next[0]
    ? (() => {
        const t = doorToDoor(next[0], beforeMin, afterMin);
        const inMin = Math.round((t.leave - now) / 60000);
        const cls = inMin <= 5 ? 'hot' : inMin <= 15 ? 'warm' : '';
        return `<div><span class="leave ${cls}">${inMin <= 1 ? 'LEAVE NOW' : `leave in ${inMin} min`}</span>
          <span class="dim">· door to door ${t.totalMin} min, there at ${hhmm(t.reach)}</span></div>`;
      })()
    : '<div class="dim">no reachable train in the next results</div>';
  const rows = conns.map((c) => {
    const t = doorToDoor(c, beforeMin, afterMin);
    const delay = c.departDelayMin > 0 ? ` <span class="warm">+${c.departDelayMin}</span>` : '';
    const status = c.canceled ? '<span class="hot">CANCELLED</span>' : `${c.changes} change${c.changes === 1 ? '' : 's'}`;
    return `<tr${c.canceled ? ' class="dim"' : ''}><td>${hhmm(t.leave)}</td><td>${hhmm(c.depart)}${delay} pl ${esc(c.platform)}</td><td>${hhmm(t.reach)}</td><td>${status}</td></tr>`;
  });
  return `<h3>&gt; ${esc(label)}</h3>${head}
    <table class="small"><tr><th>LEAVE</th><th>TRAIN</th><th>ARRIVE</th><th></th></tr>${rows.join('')}</table>`;
}

// Fetch and render every workplace, in the direction that fits the time of day.
export async function loadCommute(config, now) {
  const toWork = goingToWork(now);
  const parts = await Promise.all(config.works.map(async (w) => {
    const [from, to] = toWork ? [config.home, w.station] : [w.station, config.home];
    const conns = parseConnections(await fetchJson(connectionsUrl(from.id, to.id)));
    const [before, after] = toWork ? [config.homeMin, w.min] : [w.min, config.homeMin];
    const label = toWork ? `HOME → ${w.label}` : `${w.label} → HOME`;
    return renderTrip(label, conns, before, after, now);
  }));
  return parts.join('');
}
