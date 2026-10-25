// Cloudflare Worker that IS MIAP: it serves the site's files (index.html, js/, data/... as static
// assets, see wrangler.jsonc) and answers the few paths a browser can't fetch itself.
// Bing News and the Cloudflare Radar API send no CORS header, so the page asks this Worker,
// which forwards to a few FIXED upstreams only, so it cannot be abused as an open proxy.
// The whole Worker sits behind Cloudflare Access (login), see README.
//
//   GET /news?q=brussels  ->  Bing News RSS search, English (US market), past 24 h
//                            (Google News answers Cloudflare's servers with 503 "Sorry...", so Bing it is)
//   GET /attacks          ->  Cloudflare Radar: top attack origin -> target country pairs, last 24 h
//                             (needs the secret RADAR_TOKEN, see README; cached 15 min, shared with the snapshot)
//   GET /history?kind=gnss|quakes|attacks&days=90  ->  trends from MIAP's memory (D1 database)
//   GET|PUT /settings/commute  ->  your commute addresses, kept in the D1 database (never in this public repo)
//   GET /roads?lat=&lon=  ->  traffic incidents around you (TomTom, needs the secret TOMTOM_KEY), cached 30 min
//   POST /briefing        ->  a 2-3 sentence AI briefing of what the panels show (Workers AI, bound as AI)
//   GET /push/key, POST /push/subscribe, POST /push/test  ->  phone alerts (Web Push, see push.js + alerts.js)
//
// Cron: hourly = memory snapshot + earthquake alerts; every 5 min = commute alerts (inside the windows only).
//
// Memory: once an hour (Cron Trigger) scheduled() saves snapshots into the D1 database bound
// as DB: earthquakes (USGS), GNSS jamming per zone (data/gpsjam.json on the site) and the day's
// attack routes (Radar). Tables are created automatically on the first run.

import { newVapidKeys, sendPush } from './push.js';
import { commuteEvents, quakeEvents } from './alerts.js';
import { GRAPHQL_URL, usageQueries, parseWorkers, parseAi, parseD1 } from './usage.js';

const QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const RADAR_ATTACKS_URL =
  'https://api.cloudflare.com/client/v4/radar/attacks/layer7/top/attacks?limit=25&dateRange=1d&format=JSON';

// Returns { url, headers } for the upstream request, or throws RangeError for bad input.
export function upstreamRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname === '/news') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2 || q.length > 80) throw new RangeError('q must be 2-80 characters');
    // qft=interval="7" is Bing's "past 24 hours" filter; without it Bing returns week-old or older articles.
    const params = new URLSearchParams({ q, format: 'rss', setlang: 'en-US', mkt: 'en-US', qft: 'interval="7"' });
    return { url: `https://www.bing.com/news/search?${params}`, headers: { 'User-Agent': 'friday-dashboard-relay' } };
  }
  throw new RangeError(`unknown path ${url.pathname}`);
}

// ---------- memory (D1) ----------

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS quakes (id TEXT NOT NULL PRIMARY KEY, time INTEGER NOT NULL, mag REAL, place TEXT, lat REAL, lon REAL, depth REAL)',
  'CREATE TABLE IF NOT EXISTS gnss_daily (date TEXT NOT NULL, zone TEXT NOT NULL, high INTEGER NOT NULL, medium INTEGER NOT NULL, PRIMARY KEY (date, zone))',
  'CREATE TABLE IF NOT EXISTS attacks_daily (date TEXT NOT NULL, origin TEXT NOT NULL, origin_name TEXT, target TEXT NOT NULL, pct REAL NOT NULL, PRIMARY KEY (date, origin, target))',
  'CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS cache (key TEXT NOT NULL PRIMARY KEY, saved INTEGER NOT NULL, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT NOT NULL PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, added INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS alerts_sent (key TEXT NOT NULL PRIMARY KEY, at INTEGER NOT NULL)',
  // MIAP's own health (System tab): errors per page path and hour, and every scheduled run
  'CREATE TABLE IF NOT EXISTS route_errors (hour TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL, count INTEGER NOT NULL, last_error TEXT, PRIMARY KEY (hour, path, status))',
  'CREATE TABLE IF NOT EXISTS cron_runs (cron TEXT NOT NULL, started INTEGER NOT NULL, ms INTEGER NOT NULL, ok INTEGER NOT NULL, error TEXT)',
];

// The tables, created on first use: once per database binding while this Worker instance lives,
// not on every request (that was 7 extra statements each time).
const schemaReady = new WeakSet();
async function openDb(env) {
  const db = needDb(env);
  if (!schemaReady.has(db)) {
    await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    schemaReady.add(db);
  }
  return db;
}

// An upstream answer kept in the cache table for maxAgeMs, so many page loads cost one request.
export async function cached(db, key, maxAgeMs, load, now = Date.now()) {
  const hit = await db.prepare('SELECT saved, value FROM cache WHERE key = ?').bind(key).first();
  if (hit && now - hit.saved < maxAgeMs) return JSON.parse(hit.value);
  const value = await load();
  await db.prepare('INSERT OR REPLACE INTO cache (key, saved, value) VALUES (?, ?, ?)').bind(key, now, JSON.stringify(value)).run();
  return value;
}

// ---------- System tab: MIAP's own health ----------
// Cloudflare's numbers (see usage.js) are asked at most every 10 min (its analytics lag a few minutes
// anyway); MIAP's own records (errors per path, scheduled runs) are read live from D1.
const USAGE_CACHE_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function graphql(env, body) {
  const res = await fetch(GRAPHQL_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Cloudflare analytics`);
  return res.json();
}

// -> { workers, ai, d1 }: each the numbers, or { error } when that part failed
export async function cloudflareUsage(env, now = Date.now()) {
  const queries = usageQueries(env, now);
  const parse = { workers: parseWorkers, ai: parseAi, d1: parseD1 };
  return cached(await openDb(env), 'cf-usage', USAGE_CACHE_MS, async () => {
    const names = Object.keys(queries);
    const results = await Promise.allSettled(names.map(async (n) => parse[n](await graphql(env, queries[n]))));
    return Object.fromEntries(names.map((n, i) => [n, results[i].status === 'fulfilled' ? results[i].value : { error: results[i].reason.message }]));
  }, now);
}

const hourOf = (ms) => new Date(ms).toISOString().slice(0, 13); // '2026-10-25T10'

// An error answer from one of our routes, counted per hour and path (System tab, "errors by path").
export async function recordError(env, path, status, message, now = Date.now()) {
  await (await openDb(env)).prepare(`INSERT INTO route_errors VALUES (?, ?, ?, 1, ?)
    ON CONFLICT (hour, path, status) DO UPDATE SET count = count + 1, last_error = excluded.last_error`).bind(hourOf(now), path, status, message.slice(0, 300)).run();
}

// One scheduled run: when, how long, and how it ended. Kept 7 days.
export async function recordRun(env, cron, started, ms, error) {
  const db = await openDb(env);
  await db.batch([
    db.prepare('INSERT INTO cron_runs VALUES (?, ?, ?, ?, ?)').bind(cron, started, ms, error ? 0 : 1, error ? error.message.slice(0, 300) : null),
    db.prepare('DELETE FROM cron_runs WHERE started < ?').bind(started - 7 * 24 * HOUR_MS),
  ]);
}

export async function ownHealth(env, now = Date.now()) {
  const db = await openDb(env);
  const since = now - 24 * HOUR_MS;
  const [errors, crons, last] = await db.batch([
    db.prepare('SELECT path, status, SUM(count) AS count, MAX(hour) AS hour, last_error FROM route_errors WHERE hour >= ? GROUP BY path, status ORDER BY count DESC').bind(hourOf(since)),
    db.prepare('SELECT cron, COUNT(*) AS runs, SUM(1 - ok) AS failed, ROUND(AVG(ms)) AS avg_ms FROM cron_runs WHERE started >= ? GROUP BY cron').bind(since),
    db.prepare('SELECT cron, started, ms, ok, error FROM cron_runs c WHERE started = (SELECT MAX(started) FROM cron_runs WHERE cron = c.cron)'),
  ]);
  const lastOf = new Map(last.results.map((r) => [r.cron, r]));
  return {
    errorsByPath: errors.results,
    crons: crons.results.map((c) => ({ ...c, last: lastOf.get(c.cron) })),
  };
}

export async function systemStatus(env, now = Date.now()) {
  const [cloudflare, own] = await Promise.allSettled([cloudflareUsage(env, now), ownHealth(env, now)]);
  const part = (r) => (r.status === 'fulfilled' ? r.value : { error: r.reason.message });
  return { at: now, cloudflare: part(cloudflare), own: part(own) };
}

// The wipe button: everything MIAP collected that is older than 30 days. Settings and phones stay.
export const KEEP_DAYS = 30;
export async function prune(env, now = Date.now()) {
  const db = await openDb(env);
  const cutoff = now - KEEP_DAYS * 24 * HOUR_MS;
  const day = new Date(cutoff).toISOString().slice(0, 10);
  const jobs = {
    quakes: db.prepare('DELETE FROM quakes WHERE time < ?').bind(cutoff),
    gnss_daily: db.prepare('DELETE FROM gnss_daily WHERE date < ?').bind(day),
    attacks_daily: db.prepare('DELETE FROM attacks_daily WHERE date < ?').bind(day),
    route_errors: db.prepare('DELETE FROM route_errors WHERE hour < ?').bind(hourOf(cutoff)),
    cron_runs: db.prepare('DELETE FROM cron_runs WHERE started < ?').bind(cutoff),
    cache: db.prepare('DELETE FROM cache WHERE saved < ?').bind(cutoff),
  };
  const results = await db.batch(Object.values(jobs));
  return { before: day, deleted: Object.fromEntries(Object.keys(jobs).map((t, i) => [t, results[i].meta.changes])) };
}

// Radar's "last 24 h" ranking barely moves in 15 min; the page and the hourly snapshot share it.
const RADAR_CACHE_MS = 15 * 60 * 1000;
export async function radarAttacks(env, now = Date.now()) {
  if (!env.RADAR_TOKEN) throw new Error('RADAR_TOKEN secret is not set on this Worker');
  return cached(await openDb(env), 'radar-attacks', RADAR_CACHE_MS, () => getJson(RADAR_ATTACKS_URL, { Authorization: `Bearer ${env.RADAR_TOKEN}` }), now);
}

// Rows go in as ONE JSON parameter that SQLite unpacks with json_each: one statement per job,
// so the Worker stays far below its 10 ms CPU budget.
const INSERT_QUAKES = `INSERT OR REPLACE INTO quakes SELECT value->>0, value->>1, value->>2, value->>3, value->>4, value->>5, value->>6 FROM json_each(?)`;
const INSERT_GNSS = `INSERT OR REPLACE INTO gnss_daily SELECT value->>0, value->>1, value->>2, value->>3 FROM json_each(?)`;
const BACKFILL_GNSS = `INSERT OR IGNORE INTO gnss_daily SELECT value->>0, value->>1, value->>2, value->>3 FROM json_each(?)`;
const INSERT_ATTACKS = `INSERT INTO attacks_daily SELECT value->>0, value->>1, value->>2, value->>3, value->>4 FROM json_each(?)`;

// Pure helpers (tested): API answers -> rows.
export function quakeRows(geojson) {
  if (!Array.isArray(geojson?.features)) throw new Error('USGS: no features');
  return geojson.features.map((q) => {
    const [lon, lat, depth] = q.geometry.coordinates;
    return [q.id, q.properties.time, q.properties.mag, q.properties.place, lat, lon, depth];
  });
}

export function gnssRows(gpsjam) {
  if (!gpsjam?.date || !Array.isArray(gpsjam.regions)) throw new Error('gpsjam.json: no date/regions');
  return gpsjam.regions.map((r) => [gpsjam.date, r.name, r.high, r.medium]);
}

export function attackRows(radar, date) {
  const top = radar?.result?.top_0;
  if (!radar?.success || !Array.isArray(top)) throw new Error('Radar: unexpected answer');
  return top.map((r) => [date, r.originCountryAlpha2, r.originCountryName, r.targetCountryAlpha2, Number(r.value)]);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

// The site's own files (data/gpsjam.json ...) come from the assets binding, not over the
// internet: the public URL is behind the Access login, which a Worker can't pass.
async function assetJson(env, path) {
  if (!env.ASSETS) throw new Error('static assets are not bound to this Worker as "ASSETS" (see wrangler.jsonc)');
  const res = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

function needDb(env) {
  if (!env.DB) throw new RangeError('D1 database is not bound to this Worker as "DB" (see README, MIAP memory)');
  return env.DB;
}

// One snapshot run. Each job runs even if another fails; any failure is re-thrown at the end
// so it shows as an error in the Worker's logs.
export async function snapshot(env, now = new Date()) {
  const db = await openDb(env);
  const today = now.toISOString().slice(0, 10);
  const jobs = {
    quakes: async () => db.prepare(INSERT_QUAKES).bind(JSON.stringify(quakeRows(await getJson(QUAKES_URL)))).run(),
    gnss: async () => {
      // the backfill goes only into an empty table (first run): after a 30-day wipe old days must not come back
      const { n } = await db.prepare('SELECT COUNT(*) AS n FROM gnss_daily').first();
      if (n === 0) await db.prepare(BACKFILL_GNSS).bind(JSON.stringify(await assetJson(env, '/data/gnss-backfill.json'))).run();
      await db.prepare(INSERT_GNSS).bind(JSON.stringify(gnssRows(await assetJson(env, '/data/gpsjam.json')))).run();
    },
    attacks: async () => {
      const rows = attackRows(await radarAttacks(env, now.getTime()), today);
      // the day's latest Radar snapshot replaces the earlier ones
      await db.batch([db.prepare('DELETE FROM attacks_daily WHERE date = ?').bind(today), db.prepare(INSERT_ATTACKS).bind(JSON.stringify(rows))]);
    },
  };
  const names = Object.keys(jobs);
  const results = await Promise.allSettled(names.map((name) => jobs[name]()));
  const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${names[i]}: ${r.reason.message}`] : []));
  if (failed.length) throw new Error(`snapshot failed: ${failed.join('; ')}`);
}

// GET /history?kind=...&days=N -> JSON for the dashboard's trends panel.
export function historyQuery(requestUrl) {
  const url = new URL(requestUrl);
  const kind = url.searchParams.get('kind');
  const days = Number(url.searchParams.get('days') ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 400) throw new RangeError('days must be 1-400');
  if (!['gnss', 'quakes', 'attacks'].includes(kind)) throw new RangeError('kind must be gnss, quakes or attacks');
  const query = { kind, days };
  if (url.searchParams.has('lat')) {
    // optional: your position, to find the nearest quake (used for this query only, never stored)
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new RangeError('lat/lon out of range');
    query.near = { lat, lon };
  }
  return query;
}

export async function history(env, { kind, days, near }, now = new Date()) {
  const db = await openDb(env); // before the first snapshot: empty tables, not "no such table"
  const since = new Date(now - days * 86400000);
  const sinceDate = since.toISOString().slice(0, 10);
  if (kind === 'gnss') {
    const { results } = await db.prepare('SELECT date, zone, high, medium FROM gnss_daily WHERE date >= ? ORDER BY date').bind(sinceDate).all();
    return { days: results };
  }
  if (kind === 'attacks') {
    const { results } = await db.prepare(
      'SELECT date, origin, origin_name AS name, SUM(pct) AS pct FROM attacks_daily WHERE date >= ? GROUP BY date, origin ORDER BY date',
    ).bind(sinceDate).all();
    return { days: results };
  }
  const [daily, biggest] = await db.batch([
    db.prepare("SELECT date(time / 1000, 'unixepoch') AS date, COUNT(*) AS n, MAX(mag) AS maxMag FROM quakes WHERE time >= ? GROUP BY 1 ORDER BY 1").bind(since.getTime()),
    db.prepare('SELECT time, mag, place, lat, lon FROM quakes WHERE time >= ? ORDER BY mag DESC LIMIT 5').bind(now - 30 * 86400000),
  ]);
  const out = { days: daily.results, biggest30d: biggest.results };
  if (near) {
    // Nearest quake of the last 365 days. Flat-map distance (longitude scaled by cos(lat))
    // is plenty to pick the closest one; the dashboard computes the exact km.
    const k = Math.cos((near.lat * Math.PI) / 180);
    out.nearest365d = await db.prepare(
      'SELECT time, mag, place, lat, lon FROM quakes WHERE time >= ?1 ORDER BY (lat - ?2) * (lat - ?2) + ((lon - ?3) * ?4) * ((lon - ?3) * ?4) LIMIT 1',
    ).bind(now - 365 * 86400000, near.lat, near.lon, k).first();
  }
  return out;
}

// ---------- settings (personal data) ----------

const ACCESS_TEAM = 'https://falling-king-09ce.cloudflareaccess.com';
const MAX_SETTING_CHARS = 4096;

export class LoginError extends Error {}

// JWT parts are base64url without '=' padding; atob wants classic, padded base64.
function base64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

function decodeToken(token) {
  const [head, body, signature] = token.split('.');
  try {
    const json = (part) => JSON.parse(new TextDecoder().decode(base64url(part)));
    return { head, body, header: json(head), claims: json(body), signature: base64url(signature) };
  } catch {
    throw new LoginError('malformed Access token');
  }
}

// Settings hold your addresses, so the Worker checks the Access login itself too: if Access were
// ever switched off, /settings refuses instead of handing them to anyone. Access puts a signed
// token (JWT) on every request it lets through; we check its signature against the team's public
// keys, its issuer and its expiry. getKeys(kid) gives the team's keys (see accessKeys; tests pass their own).
export async function verifyLogin(request, now, getKeys) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new LoginError('no Access login on this request');
  const { head, body, header, claims, signature } = decodeToken(token);
  if (claims.iss !== ACCESS_TEAM) throw new LoginError(`Access token from the wrong team: ${claims.iss}`);
  if (!(claims.exp * 1000 > now)) throw new LoginError('Access login expired, reload the page');
  const jwk = (await getKeys(header.kid)).keys?.find((k) => k.kid === header.kid);
  if (!jwk) throw new LoginError('Access token signed with an unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${head}.${body}`));
  if (!valid) throw new LoginError('Access token signature is invalid');
}

// The team's public keys change only every few weeks: kept 1 h in the cache table. A token signed
// with a key we don't have yet means Cloudflare just rotated, so then the list is fetched again.
const ACCESS_KEYS_MS = 60 * 60 * 1000;
export async function accessKeys(env, kid, now = Date.now()) {
  const db = await openDb(env);
  const load = () => getJson(`${ACCESS_TEAM}/cdn-cgi/access/certs`);
  const keys = await cached(db, 'access-keys', ACCESS_KEYS_MS, load, now);
  if (keys.keys?.some((k) => k.kid === kid)) return keys;
  return cached(db, 'access-keys', 0, load, now);
}

const loggedIn = (request, env) => verifyLogin(request, Date.now(), (kid) => accessKeys(env, kid));

// GET -> the saved object (or null), PUT -> save the request body (a JSON object).
export async function settings(env, request) {
  const db = await openDb(env);
  if (request.method === 'GET') return readSetting(db, 'commute');
  if (request.method !== 'PUT') throw new RangeError(`${request.method} not allowed`);
  const text = await request.text();
  if (text.length > MAX_SETTING_CHARS) throw new RangeError(`settings too big (max ${MAX_SETTING_CHARS} characters)`);
  const value = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RangeError('settings must be a JSON object');
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('commute', ?)").bind(JSON.stringify(value)).run();
  return value;
}

export async function readSetting(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row?.value === undefined ? null : JSON.parse(row.value);
}

// ---------- roads: TomTom traffic incidents around you ----------
// Free TomTom plan: 2,500 requests a MONTH. So the answer is cached 30 min per ~20 km grid cell
// (at most ~48 calls a day even with MIAP open all day), and your position is rounded to that cell.

const TOMTOM_URL = 'https://api.tomtom.com/maps/orbis/traffic/incidents/details';
const TOMTOM_FIELDS = 'incidents(type,geometry(type,coordinates),properties(iconCategory,magnitudeOfDelay,events(description),startTime,endTime,from,to,lengthInMeters,delayInSeconds,roadNumbers))';
const ROADS_CACHE_MS = 30 * 60 * 1000;
const MAX_LINE_POINTS = 40; // enough to draw an incident's road on the map
const CELL_DEG = 0.2;

export function roadsQuery(requestUrl) {
  const url = new URL(requestUrl);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!url.searchParams.has('lat') || !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new RangeError('lat/lon missing or out of range');
  const snap = (v) => Number((Math.round(v / CELL_DEG) * CELL_DEG).toFixed(1));
  return { lat: snap(lat), lon: snap(lon) };
}

// About 78 x 78 km around the cell: under TomTom's 10,000 km² limit.
export function roadsBox({ lat, lon }) {
  return [lon - 0.55, lat - 0.35, lon + 0.55, lat + 0.35].map((v) => v.toFixed(3)).join(',');
}

const SEVERITY = { roadClosed: 0, accident: 1, jam: 2, laneClosed: 3, roadWorks: 4 };

export function parseIncidents(json) {
  if (!Array.isArray(json?.incidents)) throw new Error('TomTom: no incidents list');
  return json.incidents
    .map(({ geometry, properties: p }) => {
      const coords = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates;
      const first = coords[0];
      const step = Math.ceil(coords.length / MAX_LINE_POINTS);
      return {
        kind: p.iconCategory,
        what: p.events?.map((e) => e.description).join(', ') || p.iconCategory,
        roads: p.roadNumbers ?? [],
        from: p.from ?? '',
        to: p.to ?? '',
        delayMin: Math.round((p.delayInSeconds ?? 0) / 60),
        km: Math.round((p.lengthInMeters ?? 0) / 100) / 10,
        lat: first[1],
        lon: first[0],
        // the affected road as [lat, lon] points (thinned out), for the map
        line: coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map(([lon, lat]) => [Number(lat.toFixed(5)), Number(lon.toFixed(5))]),
      };
    })
    .sort((a, b) => (SEVERITY[a.kind] ?? 9) - (SEVERITY[b.kind] ?? 9) || b.delayMin - a.delayMin);
}

export async function roads(env, cell, now = Date.now()) {
  if (!env.TOMTOM_KEY) throw new Error('TOMTOM_KEY secret is not set on this Worker (see README, Roads)');
  // roads2: answers that include the road shapes
  return cached(await openDb(env), `roads2:${cell.lat},${cell.lon}`, ROADS_CACHE_MS, () => tomtom(env, cell, now), now);
}

async function tomtom(env, cell, now) {
  const params = new URLSearchParams({ apiVersion: '2', bbox: roadsBox(cell), timeValidity: 'present' });
  const answer = await getJson(`${TOMTOM_URL}?${params}`, { 'TomTom-Api-Key': env.TOMTOM_KEY, 'TomTom-Api-Version': '2', Attributes: TOMTOM_FIELDS, 'Accept-Language': 'en-GB' });
  return { cell, saved: now, incidents: parseIncidents(answer) };
}

// ---------- AI briefing (Workers AI) ----------
// The page sends what its panels show right now; a small model turns it into 2-3 sentences.
// Free plan: 10,000 "neurons" a day; one briefing costs about 75 (see BRIEF_MODEL).

// Llama 3.3 70B: much better judgement than the 8B model. ~75 neurons a briefing, so ~100 a day fit the free 10,000.
const BRIEF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_BRIEF_CHARS = 6000;
const BRIEF_RULES = [
  "You are MIAP, the personal assistant of Mihai, who lives in Brussels. From the dashboard readouts, write a briefing of at most 3 short sentences (60 words max). No greeting, no lists, no markdown.",
  'First think about what matters at this local day and time: weekday mornings = getting to work; weekday afternoons and evenings = getting home; weekends = weather, being out and about, the world.',
  'Never mention work or the commute to work on a Saturday or Sunday.',
  'Lead with whatever should change what he does next: a delay, cancellation or closure on his way, rain or cold (say what to wear or bring), poor air, a quake near him.',
  'If nothing needs action, say that in a few words, then give the single most notable news or world item.',
  'Be specific: use the names, times and numbers from the readouts. Use only facts from the readouts; never invent anything. Skip readouts with nothing notable.',
].join(' ');

export function briefingMessages(body) {
  const panels = body?.panels;
  if (typeof body?.now !== 'string' || typeof panels !== 'object' || panels === null) throw new RangeError('briefing needs { now, panels }');
  const lines = Object.entries(panels).map(([name, text]) => {
    if (typeof text !== 'string') throw new RangeError(`panel ${name} must be text`);
    return `[${name}] ${text}`;
  });
  const readouts = `Local time: ${body.now}\n${lines.join('\n')}`;
  if (readouts.length > MAX_BRIEF_CHARS) throw new RangeError(`briefing input too long (max ${MAX_BRIEF_CHARS} characters)`);
  return [{ role: 'system', content: BRIEF_RULES }, { role: 'user', content: readouts }];
}

export async function briefing(env, request) {
  if (request.method !== 'POST') throw new RangeError(`${request.method} not allowed`);
  if (!env.AI) throw new Error('Workers AI is not bound to this Worker as "AI" (see wrangler.jsonc)');
  const out = await env.AI.run(BRIEF_MODEL, { messages: briefingMessages(await request.json()), max_tokens: 160 });
  if (typeof out?.response !== 'string' || !out.response.trim()) throw new Error('Workers AI returned no text');
  return { text: out.response.trim() };
}

// ---------- phone alerts (Web Push) ----------

// This Worker's VAPID key pair: made once, then kept in the settings table.
async function vapidKeys(db) {
  const saved = await readSetting(db, 'vapid');
  if (saved) return saved;
  const fresh = await newVapidKeys();
  await db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(fresh)).run();
  return fresh;
}

export async function pushKey(env) {
  return { publicKey: (await vapidKeys(await openDb(env))).publicKey };
}

export async function subscribe(env, request) {
  if (request.method !== 'POST') throw new RangeError(`${request.method} not allowed`);
  const s = await request.json();
  if (!/^https:\/\//.test(s?.endpoint ?? '') || !s.keys?.p256dh || !s.keys?.auth) throw new RangeError('not a push subscription');
  const db = await openDb(env);
  await db.prepare('INSERT OR REPLACE INTO push_subs (endpoint, p256dh, auth, added) VALUES (?, ?, ?, ?)')
    .bind(s.endpoint, s.keys.p256dh, s.keys.auth, Date.now()).run();
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM push_subs').first();
  return { devices: n };
}

// Push each NEW event (not sent in the last 3 days) to every subscribed device.
// Events are marked sent only after the pushes went out: if one fails, the next run tries again.
// Subscriptions the push service reports gone (404/410) are deleted. Returns how many pushes went out.
export async function notify(env, events, now = Date.now()) {
  const db = await openDb(env);
  await db.prepare('DELETE FROM alerts_sent WHERE at < ?').bind(now - 3 * 86400000).run();
  const fresh = [];
  for (const e of events) {
    if (!(await db.prepare('SELECT 1 AS seen FROM alerts_sent WHERE key = ?').bind(e.key).first())) fresh.push(e);
  }
  if (!fresh.length) return 0;
  const vapid = await vapidKeys(db);
  const { results: subs } = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subs').all();
  let sent = 0;
  for (const s of subs) {
    for (const e of fresh) {
      const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: e.title, body: e.body, url: '/#commute' }, vapid, now);
      if (status !== 201) {
        await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
        break;
      }
      sent++;
    }
  }
  for (const e of fresh) await db.prepare('INSERT OR REPLACE INTO alerts_sent (key, at) VALUES (?, ?)').bind(e.key, now).run();
  return sent;
}

export async function pushTest(env, request) {
  if (request.method !== 'POST') throw new RangeError(`${request.method} not allowed`);
  const at = new Date().toISOString();
  return { sent: await notify(env, [{ key: `test|${at}`, title: 'MIAP alerts are on', body: `Test sent ${at.slice(11, 16)} UTC.` }]) };
}

// Cron jobs. Each part runs even if another fails; failures are re-thrown so they show in the logs.
export async function hourly(env, now) {
  const results = await Promise.allSettled([
    snapshot(env, now),
    (async () => {
      const config = await readSetting(await openDb(env), 'commute');
      if (config) await notify(env, quakeEvents(await getJson(QUAKES_URL), config.home, now), now.getTime());
    })(),
  ]);
  const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (failed.length) throw new Error(failed.join(' | '));
}

export async function everyFiveMinutes(env, now) {
  const config = await readSetting(await openDb(env), 'commute');
  if (!config) return; // no addresses saved yet
  await notify(env, await commuteEvents(config, now, getJson), now.getTime());
}

// Paths answered with JSON by this Worker. Errors: 403 login, 400 bad input, 500 anything else.
const ROUTES = {
  '/push/key': async (request, env) => { await loggedIn(request, env); return pushKey(env); },
  '/push/subscribe': async (request, env) => { await loggedIn(request, env); return subscribe(env, request); },
  '/push/test': async (request, env) => { await loggedIn(request, env); return pushTest(env, request); },
  '/settings/commute': async (request, env) => { await loggedIn(request, env); return settings(env, request); },
  '/attacks': (request, env) => radarAttacks(env),
  '/history': (request, env) => history(env, historyQuery(request.url)),
  '/roads': (request, env) => roads(env, roadsQuery(request.url)),
  '/briefing': (request, env) => briefing(env, request),
  '/system': async (request, env) => { await loggedIn(request, env); return systemStatus(env); },
  '/system/prune': async (request, env) => {
    if (request.method !== 'POST') throw new RangeError('use POST');
    await loggedIn(request, env);
    return prune(env);
  },
};

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const route = ROUTES[path];
    if (route) {
      try {
        return new Response(JSON.stringify(await route(request, env)), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        const status = err instanceof LoginError ? 403 : err instanceof RangeError || err instanceof SyntaxError ? 400 : 500;
        // counted for the System tab after the answer goes out; if counting fails, it shows in the Worker's logs
        ctx.waitUntil(recordError(env, path, status, err.message));
        return new Response(err.message, { status });
      }
    }
    let target;
    try {
      target = upstreamRequest(request.url);
    } catch (err) {
      return new Response(err.message, { status: 400 });
    }
    try {
      const upstream = await fetch(target.url, { headers: target.headers });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain' },
      });
    } catch (err) {
      ctx.waitUntil(recordError(env, path, 502, err.message));
      return new Response(`upstream failed: ${err.message}`, { status: 502 });
    }
  },

  // Every run is recorded (System tab), then a failure is re-thrown so it also shows in the logs.
  async scheduled(event, env) {
    const now = new Date(event.scheduledTime);
    const started = Date.now();
    let failure = null;
    try {
      if (event.cron === '*/5 * * * *') await everyFiveMinutes(env, now);
      else await hourly(env, now);
    } catch (err) {
      failure = err;
    }
    await recordRun(env, event.cron, started, Date.now() - started, failure);
    if (failure) throw failure;
  },
};
