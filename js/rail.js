// Rail disruptions from the SNCB/NMBS, through iRail (https://api.irail.be, free, no key, CORS allowed).
// iRail lists every current disruption and planned work in Belgium as text ("Leuven - Ottignies: No trains").
// "Near you" = the title names a station within NEAR_KM of you (station positions also come from iRail).
// Used by the Roads & rail panel, and by the Worker's commute alerts.
import { distanceKm } from './geo.js';

export const DISTURBANCES_URL = 'https://api.irail.be/v1/disturbances/?format=json&lang=en';
export const STATIONS_URL = 'https://api.irail.be/v1/stations/?format=json&lang=en';
export const NEAR_KM = 30;

// "Louvain / Leuven" and "Brussels-South/Brussels-Midi" -> comparable names
export function normalize(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// The ends of the stretch in a title: the part before ':' split on ' - ', each end with its
// FR/NL names split on '/'. "Louvain / Leuven - Ottignies: ..." -> [['louvain', 'leuven'], ['ottignies']].
// Titles shorten Brussels stations ("Brux.-Midi/Brus.-Zuid"); the station list spells them out.
export function stretchEnds(title) {
  return title.split(':')[0].split(' - ')
    .map((end) => end.split('/').map(normalize).map((p) => p.replace(/^brux\./, 'bruxelles').replace(/^brus\./, 'brussel')).filter(Boolean))
    .filter((end) => end.length);
}

export function placesIn(title) {
  return stretchEnds(title).flat();
}

export function parseDisturbances(json) {
  if (!Array.isArray(json?.disturbance)) throw new Error('iRail: no disturbance list');
  return json.disturbance
    .map((d) => ({ title: d.title, text: d.description, planned: d.type === 'planned', time: new Date(Number(d.timestamp) * 1000), link: d.link }))
    .sort((a, b) => b.time - a.time);
}

export function parseStations(json) {
  if (!Array.isArray(json?.station)) throw new Error('iRail: no station list');
  return json.station.map((s) => ({
    names: [...new Set([s.name, s.standardname].flatMap((n) => n.split('/')).map(normalize))],
    lat: Number(s.locationY),
    lon: Number(s.locationX),
  }));
}

export function stationNamesNear(stations, here, km = NEAR_KM) {
  return new Set(stations.filter((s) => distanceKm(here.lat, here.lon, s.lat, s.lon) <= km).flatMap((s) => s.names));
}

// Where each disruption is, for the map: the known stations at its stretch ends, as [lat, lon]
// (two = a line between them, one = a point). Disruptions naming no known station are left out.
export function railShapes(disruptions, stations) {
  const byName = new Map(stations.flatMap((s) => s.names.map((n) => [n, s])));
  return disruptions.flatMap((d) => {
    const points = stretchEnds(d.title)
      .map((names) => names.map((n) => byName.get(n)).find(Boolean))
      .filter(Boolean)
      .map((s) => [s.lat, s.lon]);
    return points.length ? [{ title: d.title, planned: d.planned, points }] : [];
  });
}

export function mentions(disturbance, names) {
  return placesIn(disturbance.title).some((p) => names.has(p));
}
