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

// The places in a title: the part before ':' split on ' - ' (stretch ends) and '/' (FR/NL names).
// Titles shorten Brussels stations ("Brux.-Midi/Brus.-Zuid"); the station list spells them out.
export function placesIn(title) {
  return title.split(':')[0].split(' - ').flatMap((part) => part.split('/')).map(normalize)
    .map((p) => p.replace(/^brux\./, 'bruxelles').replace(/^brus\./, 'brussel')).filter(Boolean);
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

export function mentions(disturbance, names) {
  return placesIn(disturbance.title).some((p) => names.has(p));
}
