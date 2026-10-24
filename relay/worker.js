// Cloudflare Worker that IS MIAP: it serves the site's files (index.html, js/, data/... as static
// assets, see wrangler.jsonc) and answers the few paths a browser can't fetch itself.
// Bing News and the Cloudflare Radar API send no CORS header, so the page asks this Worker,
// which forwards to a few FIXED upstreams only, so it cannot be abused as an open proxy.
// The whole Worker sits behind Cloudflare Access (login), see README.
//
//   GET /news?q=brussels  ->  Bing News RSS search, English (US market), past 24 h
//                            (Google News answers Cloudflare's servers with 503 "Sorry...", so Bing it is)
//   GET /attacks          ->  Cloudflare Radar: top attack origin -> target country pairs, last 24 h
//                             (needs the secret RADAR_TOKEN, see README)
//   GET /history?kind=gnss|quakes|attacks&days=90  ->  trends from MIAP's memory (D1 database)
//   GET|PUT /settings/commute  ->  your commute addresses, kept in the D1 database (never in this public repo)
//
// Memory: once an hour (Cron Trigger) scheduled() saves snapshots into the D1 database bound
// as DB: earthquakes (USGS), GNSS jamming per zone (data/gpsjam.json on the site) and the day's
// attack routes (Radar). Tables are created automatically on the first run.

const QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const RADAR_ATTACKS_URL =
  'https://api.cloudflare.com/client/v4/radar/attacks/layer7/top/attacks?limit=25&dateRange=1d&format=JSON';

// Returns { url, headers } for the upstream request, or throws RangeError for bad input.
export function upstreamRequest(requestUrl, env) {
  const url = new URL(requestUrl);
  if (url.pathname === '/news') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2 || q.length > 80) throw new RangeError('q must be 2-80 characters');
    // qft=interval="7" is Bing's "past 24 hours" filter; without it Bing returns week-old or older articles.
    const params = new URLSearchParams({ q, format: 'rss', setlang: 'en-US', mkt: 'en-US', qft: 'interval="7"' });
    return { url: `https://www.bing.com/news/search?${params}`, headers: { 'User-Agent': 'friday-dashboard-relay' } };
  }
  if (url.pathname === '/attacks') {
    if (!env.RADAR_TOKEN) throw new RangeError('RADAR_TOKEN secret is not set on this Worker');
    return { url: RADAR_ATTACKS_URL, headers: { Authorization: `Bearer ${env.RADAR_TOKEN}` } };
  }
  throw new RangeError(`unknown path ${url.pathname}`);
}

// ---------- memory (D1) ----------

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS quakes (id TEXT NOT NULL PRIMARY KEY, time INTEGER NOT NULL, mag REAL, place TEXT, lat REAL, lon REAL, depth REAL)',
  'CREATE TABLE IF NOT EXISTS gnss_daily (date TEXT NOT NULL, zone TEXT NOT NULL, high INTEGER NOT NULL, medium INTEGER NOT NULL, PRIMARY KEY (date, zone))',
  'CREATE TABLE IF NOT EXISTS attacks_daily (date TEXT NOT NULL, origin TEXT NOT NULL, origin_name TEXT, target TEXT NOT NULL, pct REAL NOT NULL, PRIMARY KEY (date, origin, target))',
  'CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)',
];

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
  const db = needDb(env);
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  const today = now.toISOString().slice(0, 10);
  const jobs = {
    quakes: async () => db.prepare(INSERT_QUAKES).bind(JSON.stringify(quakeRows(await getJson(QUAKES_URL)))).run(),
    gnss: async () => {
      await db.prepare(INSERT_GNSS).bind(JSON.stringify(gnssRows(await assetJson(env, '/data/gpsjam.json')))).run();
      const { n } = await db.prepare('SELECT COUNT(DISTINCT date) AS n FROM gnss_daily').first();
      if (n < 30) await db.prepare(BACKFILL_GNSS).bind(JSON.stringify(await assetJson(env, '/data/gnss-backfill.json'))).run();
    },
    attacks: async () => {
      if (!env.RADAR_TOKEN) throw new Error('RADAR_TOKEN secret is not set');
      const rows = attackRows(await getJson(RADAR_ATTACKS_URL, { Authorization: `Bearer ${env.RADAR_TOKEN}` }), today);
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
  const db = needDb(env);
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
// keys, its issuer and its expiry. getKeys is swappable for tests.
export async function verifyLogin(request, now = Date.now(), getKeys = () => getJson(`${ACCESS_TEAM}/cdn-cgi/access/certs`)) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new LoginError('no Access login on this request');
  const { head, body, header, claims, signature } = decodeToken(token);
  if (claims.iss !== ACCESS_TEAM) throw new LoginError(`Access token from the wrong team: ${claims.iss}`);
  if (!(claims.exp * 1000 > now)) throw new LoginError('Access login expired, reload the page');
  const jwk = (await getKeys()).keys?.find((k) => k.kid === header.kid);
  if (!jwk) throw new LoginError('Access token signed with an unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${head}.${body}`));
  if (!valid) throw new LoginError('Access token signature is invalid');
}

// GET -> the saved JSON (or null), PUT -> save the request body (a JSON object).
export async function settings(env, request) {
  const db = needDb(env);
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  if (request.method === 'GET') {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'commute'").first();
    return row?.value ?? 'null';
  }
  if (request.method !== 'PUT') throw new RangeError(`${request.method} not allowed`);
  const text = await request.text();
  if (text.length > MAX_SETTING_CHARS) throw new RangeError(`settings too big (max ${MAX_SETTING_CHARS} characters)`);
  const value = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RangeError('settings must be a JSON object');
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('commute', ?)").bind(JSON.stringify(value)).run();
  return JSON.stringify(value);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/settings/commute') {
      try {
        await verifyLogin(request);
        return new Response(await settings(env, request), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        const status = err instanceof LoginError ? 403 : err instanceof RangeError || err instanceof SyntaxError ? 400 : 500;
        return new Response(err.message, { status });
      }
    }
    if (new URL(request.url).pathname === '/history') {
      try {
        const body = await history(env, historyQuery(request.url));
        return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(err.message, { status: err instanceof RangeError ? 400 : 500 });
      }
    }
    let target;
    try {
      target = upstreamRequest(request.url, env);
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
      return new Response(`upstream failed: ${err.message}`, { status: 502 });
    }
  },

  // Cron Trigger (hourly): save the snapshots.
  async scheduled(event, env) {
    await snapshot(env, new Date(event.scheduledTime));
  },
};
