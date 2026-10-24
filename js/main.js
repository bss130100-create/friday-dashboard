// Entry point: wires each panel to its data source and refresh interval.
import { runPanel, showBody, showError, esc } from './ui.js';
import { getLocation } from './location.js';
import { renderClock } from './clock.js';
import { loadWeather, renderWeather } from './weather.js';
import { loadAir, renderAir } from './airquality.js';
import { loadAstro, renderAstro } from './astro.js';
import { loadNews, renderNews } from './news.js';
import { loadQuakes, renderQuakes } from './quakes.js';
import { loadOutages, renderOutages } from './outages.js';
import { loadGpsJam, renderGpsJam } from './gpsjam.js';
import { loadAttacks, renderAttacks } from './attacks.js';
import { makeZoomable } from './zoom.js';
import { loadTopic, readWatched, toggleWatched, renderTopic } from './topic.js';
import { STATIONS_URL, parseStations, findStation, readConfig, saveConfig, loadCommute } from './commute.js';
import { fetchJson } from './http.js';
import { ISS_TLE_URL, GPS_TLE_URL, loadTle, parseTle, satState, visibleGps, renderSatellites } from './satellites.js';

const MINUTE = 60 * 1000;

// Ask for location once; if it fails, the next panel refresh asks again.
let locationPromise = null;
function location() {
  locationPromise ??= getLocation().catch((err) => {
    locationPromise = null;
    throw err;
  });
  return locationPromise;
}

// Location is optional for the world maps: show "you" if we already have it, never wait for it.
let knownLocation = null;
location().then((here) => { knownLocation = here; }, () => {});

// --- clock: pure computation, every second
setInterval(() => showBody('clock', renderClock(new Date())), 1000);
showBody('clock', renderClock(new Date()));

// --- location-based panels
runPanel('weather', async () => showBody('weather', renderWeather(await loadWeather(await location()))), 10 * MINUTE);
runPanel('air', async () => showBody('air', renderAir(await loadAir(await location()))), 30 * MINUTE);
let astro = null;
runPanel('astro', async () => { astro = await loadAstro(await location()); showBody('astro', renderAstro(astro, new Date())); }, 60 * MINUTE);
setInterval(() => astro && showBody('astro', renderAstro(astro, new Date())), MINUTE); // keep "daylight left" ticking

// --- world panels (three of them can be zoomed)
for (const id of ['quakes', 'outages', 'gpsjam']) makeZoomable(id);
runPanel('quakes', async () => showBody('quakes', renderQuakes(await loadQuakes(), new Date(), knownLocation)), 5 * MINUTE);
runPanel('outages', async () => showBody('outages', renderOutages(await loadOutages(new Date()))), 15 * MINUTE);
runPanel('gpsjam', async () => showBody('gpsjam', renderGpsJam(await loadGpsJam(), knownLocation)), 60 * MINUTE);
runPanel('attacks', async () => showBody('attacks', renderAttacks(await loadAttacks())), 30 * MINUTE);

// --- satellites: orbits (TLEs) are refreshed rarely, positions are recomputed every 2 s
let orbits = null;
runPanel('sats', async () => {
  const [iss] = parseTle(await loadTle(ISS_TLE_URL));
  const gps = parseTle(await loadTle(GPS_TLE_URL));
  orbits = { iss, gps };
}, 30 * MINUTE);

setInterval(async () => {
  if (!orbits) return; // still loading, or the load failed (error already shown)
  try {
    const here = await location();
    const now = new Date();
    showBody('sats', renderSatellites(satState(orbits.iss.satrec, now, here), visibleGps(orbits.gps, now, here), orbits.gps.length));
  } catch (err) {
    showError('sats', err);
  }
}, 2000);

// --- news: place typed by the user, remembered in this browser
const NEWS_KEY = 'newsPlace';
const form = document.getElementById('news-form');
const input = form.elements.place;
input.value = readSavedPlace();

function readSavedPlace() {
  try {
    return localStorage.getItem(NEWS_KEY) ?? '';
  } catch {
    return ''; // storage blocked (private mode): start empty
  }
}

async function refreshNews() {
  const place = input.value.trim();
  if (!place) {
    showBody('news', '<p class="dim">Type a city, region or country above and press Enter.</p>');
    return;
  }
  showBody('news', `<p class="dim">Scanning news for "${esc(place)}"…</p>`);
  const now = new Date();
  showBody('news', renderNews(place, await loadNews(place, now), now));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    localStorage.setItem(NEWS_KEY, input.value.trim());
  } catch {
    // storage blocked: works for this visit only
  }
  input.blur();
  refreshNews().catch((err) => showError('news', err));
});

runPanel('news', refreshNews, 10 * MINUTE);

// --- topic of the week: data/topic.json + "watched" ticks saved in this browser
let topic = null;
const drawTopic = () => showBody('topic', renderTopic(topic, readWatched(topic.topic), new Date()));
runPanel('topic', async () => { topic = await loadTopic(); drawTopic(); }, 60 * MINUTE);
document.getElementById('topic').addEventListener('change', (event) => {
  const url = event.target.dataset.url;
  if (!url) return;
  try {
    toggleWatched(topic.topic, url);
    drawTopic();
  } catch (err) {
    showError('topic', err);
  }
});

// --- commute: stations + minutes typed once in the setup form, saved only in this browser
const setup = document.getElementById('commute-setup');
const commuteForm = document.getElementById('commute-form');
const formError = document.getElementById('commute-form-error');
let stations = null;

async function loadStations() {
  stations ??= parseStations(await fetchJson(STATIONS_URL));
  document.getElementById('stations').innerHTML = stations.map((st) => `<option value="${esc(st.name)}">`).join('');
}

function fillForm(config) {
  const f = commuteForm.elements;
  f.home.value = config.home.name;
  f.homeMin.value = config.homeMin;
  config.works.forEach((w, i) => {
    f[`label${i + 1}`].value = w.label;
    f[`station${i + 1}`].value = w.station.name;
    f[`min${i + 1}`].value = w.min;
  });
}

function configFromForm() {
  const f = commuteForm.elements;
  const works = [1, 2]
    .filter((i) => i === 1 || f[`label${i}`].value.trim())
    .map((i) => ({ label: f[`label${i}`].value.trim(), station: findStation(stations, f[`station${i}`].value), min: Number(f[`min${i}`].value) }));
  return { home: findStation(stations, f.home.value), homeMin: Number(f.homeMin.value), works };
}

async function refreshCommute() {
  const config = readConfig();
  if (!config) {
    setup.open = true;
    showBody('commute', '<p class="dim">Open setup above: enter your home and work stations once.</p>');
    return;
  }
  showBody('commute', await loadCommute(config, new Date()));
}

setup.addEventListener('toggle', () => {
  if (setup.open) loadStations().catch((err) => { formError.textContent = `Station list failed: ${err.message}`; });
});

commuteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  formError.textContent = '';
  try {
    if (!stations) throw new Error('Station list not loaded yet, try again in a moment');
    saveConfig(configFromForm());
  } catch (err) {
    formError.textContent = err.message;
    return;
  }
  setup.open = false;
  refreshCommute().catch((err) => showError('commute', err));
});

try {
  const saved = readConfig();
  if (saved) fillForm(saved);
} catch (err) {
  formError.textContent = err.message;
}
runPanel('commute', refreshCommute, 2 * MINUTE);
