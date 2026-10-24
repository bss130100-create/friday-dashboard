// Entry point: wires each panel to its data source and refresh interval.
import { runPanel, showBody, showError, esc } from './ui.js';
import { getLocation } from './location.js';
import { renderClock } from './clock.js';
import { loadWeather, renderWeather } from './weather.js';
import { loadCves, renderCves } from './cves.js';
import { loadNews, renderNews } from './news.js';
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

// --- clock: pure computation, every second
setInterval(() => showBody('clock', renderClock(new Date())), 1000);
showBody('clock', renderClock(new Date()));

// --- weather: every 10 min
runPanel('weather', async () => showBody('weather', renderWeather(await loadWeather(await location()))), 10 * MINUTE);

// --- CVEs: every 30 min
runPanel('cves', async () => showBody('cves', renderCves(await loadCves(new Date()))), 30 * MINUTE);

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
  showBody('news', `<p class="dim">Searching "${esc(place)}"<span class="cursor">_</span></p>`);
  showBody('news', renderNews(place, await loadNews(place), new Date()));
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
