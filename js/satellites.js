// Satellites panel: ISS position + which GPS satellites are above you right now.
//
// How it works: CelesTrak publishes each satellite's orbit as a "TLE" (two-line
// element set: 2 lines of numbers describing the orbit at one moment). The SGP4
// model (vendor/satellite.es.js) moves that orbit forward to "now", so we get
// live positions every second while downloading the TLEs only every 2 hours.
import * as sat from '../vendor/satellite.es.js';
import { fetchText } from './http.js';
import { esc } from './ui.js';

export const ISS_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle';
export const GPS_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle';
// CelesTrak updates every 2 h and blocks clients that download more often.
const TLE_MAX_AGE_MS = 2 * 3600 * 1000;
const rad2deg = (r) => (r * 180) / Math.PI;
const deg2rad = (d) => (d * Math.PI) / 180;

// "NAME\nLINE1\nLINE2\n..." -> [{ name, satrec }]
export function parseTle(text) {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  if (lines.length < 3 || lines.length % 3 !== 0) {
    throw new Error(`Bad TLE data (${lines.length} lines): ${text.slice(0, 80)}`);
  }
  const sats = [];
  for (let i = 0; i < lines.length; i += 3) {
    const [name, l1, l2] = lines.slice(i, i + 3);
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) throw new Error(`Bad TLE lines for ${name}`);
    sats.push({ name: name.trim(), satrec: sat.twoline2satrec(l1, l2) });
  }
  return sats;
}

// Download TLE text, reusing a copy saved in this browser if it is < 2 h old.
export async function loadTle(url, now = Date.now()) {
  const key = `tle:${url}`;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(key));
  } catch {
    cached = null; // storage blocked (private mode): just download
  }
  if (cached && now - cached.savedAt < TLE_MAX_AGE_MS) return cached.text;

  const text = await fetchText(url);
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: now, text }));
  } catch {
    // storage blocked: nothing saved, next load downloads again
  }
  return text;
}

function observerGd(observer) {
  return { latitude: deg2rad(observer.lat), longitude: deg2rad(observer.lon), height: 0 };
}

// Position of one satellite at `date`, plus where to look from `observer`.
export function satState(satrec, date, observer) {
  const pv = sat.propagate(satrec, date);
  if (!pv || !pv.position) throw new Error(`SGP4 propagation failed (error ${satrec.error})`);
  const gmst = sat.gstime(date);
  const geo = sat.eciToGeodetic(pv.position, gmst);
  const look = sat.ecfToLookAngles(observerGd(observer), sat.eciToEcf(pv.position, gmst));
  const v = pv.velocity;
  return {
    lat: rad2deg(geo.latitude),
    lon: rad2deg(geo.longitude),
    altKm: geo.height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
    elevation: rad2deg(look.elevation), // degrees above your horizon (negative = below)
    azimuth: rad2deg(look.azimuth),     // compass direction, 0 = north
    rangeKm: look.rangeSat,             // straight-line distance from you
  };
}

// GPS satellites above the horizon, highest first.
export function visibleGps(gpsSats, date, observer) {
  return gpsSats
    .map(({ name, satrec }) => ({ prn: name.match(/PRN (\d+)/)?.[1] ?? '?', ...satState(satrec, date, observer) }))
    .filter((s) => s.elevation > 0)
    .sort((a, b) => b.elevation - a.elevation);
}

// Polar "sky plot": centre = straight up, edge = horizon, top = north.
// Polar "sky plot": centre = straight overhead, outer ring = horizon, north at the top.
function skyPlot(visible) {
  const R = 90;
  const dots = visible.map((s) => {
    const r = R * (1 - s.elevation / 90);
    const x = r * Math.sin(deg2rad(s.azimuth));
    const y = -r * Math.cos(deg2rad(s.azimuth));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${esc(s.prn)}: ${s.elevation.toFixed(0)}° up</title></circle>`;
  });
  return `<svg class="sky" viewBox="-100 -100 200 200" role="img" aria-label="GPS satellites above you">
    <circle r="90" class="ring"/><circle r="45" class="ring"/>
    <text x="-3" y="-92" class="lbl">N</text>${dots.join('')}</svg>`;
}

// Simple view: where the ISS is + how many GPS satellites you can "see" right now.
export function renderSatellites(iss, gpsVisible, gpsTotal) {
  const where = iss.elevation > 0 ? 'above your horizon now' : `${Math.round(iss.rangeKm).toLocaleString('en-US')} km from you`;
  return `
    <h3>&gt; ISS</h3>
    <div><span class="big">${iss.altKm.toFixed(0)} km</span> up, ${(iss.speedKmS * 3600).toFixed(0)} km/h</div>
    <div class="dim">over ${iss.lat.toFixed(1)}°, ${iss.lon.toFixed(1)}°, ${where}</div>
    <h3>&gt; GPS</h3>
    <div class="orbit">${skyPlot(gpsVisible)}
      <div><span class="big">${gpsVisible.length}</span> of ${gpsTotal} sats above you<br>
      <span class="dim">centre = overhead, ring = horizon</span></div></div>`;
}
