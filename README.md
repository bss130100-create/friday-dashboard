# friday-dashboard

A green-on-black, terminal-style live dashboard. Plain HTML + CSS + JavaScript:
no framework, no build step. GitHub Pages serves the files as they are.

**Live:** https://bss130100-create.github.io/friday-dashboard/

## Panels and how they work

| Panel | Source (free, no API key) | Refresh | What happens |
|---|---|---|---|
| `[ TIME ]` | your device clock | 1 s | Shows local, UTC and **GPS time**. GPS time started 1980-01-06 and never adds leap seconds, so today it runs **18 s ahead of UTC**. Also shows the GPS week number and its old 10-bit form (it rolled over to 0 in 1999 and 2019, which broke old receivers). |
| `[ SAT-TRACK ]` | [CelesTrak](https://celestrak.org) TLEs | orbits: 2 h, positions: 2 s | Downloads each satellite's orbit as a *TLE* (two lines of numbers), then the SGP4 model (`vendor/satellite.es.js`) predicts where the ISS and every GPS satellite is *right now*. The sky plot shows the GPS satellites above you: centre = straight up, outer ring = horizon, top = north. |
| `[ WX ]` | [Open-Meteo](https://open-meteo.com) | 10 min | Sends your rounded coordinates, gets current conditions + sunrise/sunset. |
| `[ NEWSFEED ]` | Google News RSS, via your relay | 10 min | Type a city/region/country and press Enter. We ask Google News for English articles about that place from the last 24 h. Your choice is remembered in this browser. |
| `[ CVE-CRITICAL ]` | [NVD](https://nvd.nist.gov) API 2.0 | 30 min | Critical (CVSS ≥ 9.0) CVEs published in the last 7 days, newest first. |

Location comes from your browser's location permission. Only Open-Meteo receives it.

### CORS, and why news needs a relay
Browsers only let our page read another site's answer if that site sends the header
`Access-Control-Allow-Origin` (this rule is called **CORS**). CelesTrak, Open-Meteo and NVD send it.
Google News does not, and neither does any free flight API.

The fix is a **relay**: a tiny server we control that fetches Google News and adds the header.
`relay/worker.js` is that relay, about 30 lines, running free on Cloudflare Workers.
It only forwards to Google News (it is not an open proxy) and only answers our github.io page.
(GDELT, a keyless news API with CORS, was tried first but answers almost everything with
`429 Too Many Requests`.)

### News relay setup (one time, ~5 min)
1. Create a free account at https://dash.cloudflare.com/sign-up.
2. In the dashboard open **Workers & Pages** → **Create application** → **Start with Hello World!** (the Hello World template).
3. Name it `friday-relay` → **Deploy**.
4. Click **Edit code**, delete everything, paste the contents of `relay/worker.js`, click **Deploy**.
5. Copy the Worker's address, e.g. `https://friday-relay.<your-name>.workers.dev`.
6. Put it in `js/config.js` as `RELAY_URL` (no trailing slash) and push to `main`.

Test it: opening `https://friday-relay.<your-name>.workers.dev/news?q=Brussels` in a browser should show XML.

## Errors are loud on purpose
Every panel fails on its own and shows the reason in red (e.g. `HTTP 503 from services.nvd.nist.gov`).
Nothing falls back to fake or old data. `js/http.js` turns any non-2xx response or timeout into an error,
and `js/ui.js` `runPanel()` catches it and prints it in that panel. Details also go to the browser console.

## Files
```
index.html            page layout, one <section> per panel
style.css             the green terminal look (+ CRT scanlines)
manifest.webmanifest  makes it installable ("Add to Home Screen")
js/main.js            wires each panel to its loader and refresh timer
js/http.js            fetch wrapper that throws on errors
js/ui.js              render helpers + runPanel() error handling
js/clock.js           GPS time maths
js/satellites.js      TLE download/cache + SGP4 positions + sky plot
js/weather.js, js/news.js, js/cves.js   one file per data source
js/config.js                            your relay address
relay/worker.js                         the Cloudflare Worker relay for news
js/geo.js, js/location.js               distance/compass maths, browser location
vendor/satellite.es.js                  satellite.js 6.0.2 (MIT), copied as-is
tests/                                  unit tests (node --test)
```
Each data module has the same shape: `xxxUrl()` builds the request, `parseXxx()` turns raw JSON
into a small object (and throws if it looks wrong), `renderXxx()` makes the HTML. Parsing is
separate from fetching, which is what makes it testable without the internet.

## Run it locally
```bash
npm run serve      # then open http://localhost:8000
npm test           # 37 tests, needs Node 22+
```
Opening `index.html` directly from disk does not work: browsers block JavaScript modules on `file://`.

## Install on iPhone
Open the live link in **Safari** → Share → **Add to Home Screen**. It opens full-screen like an app.
Allow location when asked.

## Deploy
GitHub Pages serves the `main` branch root. Push to `main` and the site updates within a minute.
