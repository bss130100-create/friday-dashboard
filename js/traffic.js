// Roads & rail panel: traffic incidents around you (TomTom, through our Worker's /roads, which
// keeps the API key and caches) and SNCB rail disruptions near you (iRail, see rail.js).
import { fetchJson } from './http.js';
import { esc, ago } from './ui.js';
import { DISTURBANCES_URL, STATIONS_URL, parseDisturbances, parseStations, stationNamesNear, mentions } from './rail.js';

const KIND_LABEL = {
  roadClosed: 'CLOSED', accident: 'ACCIDENT', jam: 'JAM', laneClosed: 'LANE CLOSED', roadWorks: 'WORKS',
  brokenDownVehicle: 'BROKEN DOWN', dangerousConditions: 'DANGER', flooding: 'FLOODING', ice: 'ICE', fog: 'FOG',
};
const MAX_ROADS = 8;
const MAX_RAIL = 6;

export function roadsUrl(here) {
  return `/roads?${new URLSearchParams({ lat: here.lat.toFixed(3), lon: here.lon.toFixed(3) })}`;
}

// Station list (~600 stations) barely changes: fetched once per visit.
let stations = null;
async function loadStations() {
  stations ??= parseStations(await fetchJson(STATIONS_URL));
  return stations;
}

export async function loadRail(here) {
  const [all, list] = [parseDisturbances(await fetchJson(DISTURBANCES_URL)), await loadStations()];
  const names = stationNamesNear(list, here);
  return { near: all.filter((d) => mentions(d, names)), elsewhere: all.filter((d) => !mentions(d, names)).length };
}

export function renderRoads(incidents) {
  if (!incidents.length) return '<p class="dim">No incidents reported around you.</p>';
  const rows = incidents.slice(0, MAX_ROADS).map((i) => {
    const cls = i.kind === 'roadClosed' || i.kind === 'accident' ? 'hot' : i.delayMin >= 10 ? 'warm' : 'dim';
    const road = i.roads.length ? `<b>${esc(i.roads.join(' / '))}</b> ` : '';
    const where = i.from || i.to ? `${esc(i.from)} → ${esc(i.to)}` : '';
    const size = [i.delayMin > 0 ? `+${i.delayMin} min` : '', i.km > 0 ? `${i.km} km` : ''].filter(Boolean).join(', ');
    return `<li><span class="tag ${cls}">${esc(KIND_LABEL[i.kind] ?? i.kind)}</span> ${road}${where}
      ${size ? `<span class="${cls}">${size}</span>` : ''}<br><span class="dim small">${esc(i.what)}</span></li>`;
  });
  const more = incidents.length > MAX_ROADS ? `<p class="dim small">+${incidents.length - MAX_ROADS} smaller incidents</p>` : '';
  return `<ul class="incidents">${rows.join('')}</ul>${more}`;
}

export function renderRail({ near, elsewhere }, now) {
  const rows = near.slice(0, MAX_RAIL).map((d) => `<li><span class="tag ${d.planned ? 'cool' : 'hot'}">${d.planned ? 'PLANNED' : 'NOW'}</span>
    <a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.title)}</a> <span class="dim small">${ago(d.time, now)}</span></li>`);
  const none = near.length ? '' : '<p class="dim">No disruptions on lines near you.</p>';
  return `${none}<ul class="incidents">${rows.join('')}</ul><p class="dim small">${elsewhere} more elsewhere in Belgium</p>`;
}

// Roads and rail fail independently: one source down still shows the other.
export function renderTraffic(roads, rail, now) {
  const part = (title, result, render) =>
    `<h3>&gt; ${title}</h3>${result.status === 'fulfilled' ? render(result.value) : `<p class="err">ERROR: ${esc(result.reason.message)}</p>`}`;
  return `<div class="traffic">
    <div>${part('ROADS · 40 km around you', roads, (r) => renderRoads(r.incidents))}</div>
    <div>${part('RAIL · lines near you', rail, (r) => renderRail(r, now))}</div></div>`;
}

export async function loadTraffic(here, now) {
  const [roads, rail] = await Promise.allSettled([fetchJson(roadsUrl(here)), loadRail(here)]);
  if (roads.status === 'rejected' && rail.status === 'rejected') throw new Error(`roads: ${roads.reason.message}; rail: ${rail.reason.message}`);
  return renderTraffic(roads, rail, now);
}
