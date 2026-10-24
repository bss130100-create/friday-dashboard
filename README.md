# friday-dashboard

**F.R.I.D.A.Y.**: a JARVIS-style holographic HUD dashboard with live data.
Plain HTML + CSS + JavaScript: no framework, no build step. GitHub Pages serves the files as they are.

**Live:** https://bss130100-create.github.io/friday-dashboard/

## Panels and how they work

| Panel | Source | Refresh | What happens |
|---|---|---|---|
| Chronometer | your device clock | 1 s | Local, UTC and **GPS time**. GPS time started 1980-01-06 and never adds leap seconds, so today it runs **18 s ahead of UTC**. Also the GPS week number and its old 10-bit form (it rolled over to 0 in 1999 and 2019, which broke old receivers). |
| Atmosphere | [Open-Meteo](https://open-meteo.com) | 10 min | Current weather at your location. |
| Air quality · Pollen | Open-Meteo air quality (Copernicus CAMS model) | 30 min | European AQI (0-20 good … >100 extremely poor), particles, ozone, NO₂, and pollen. Pollen is only modelled for Europe. Pollen bands (<10 low, <50 moderate, else high, grains/m³) are a rough glance scale, not medical advice. |
| Sun · Moon | Open-Meteo + local maths | 1 h (countdown every min) | Sunrise/sunset/daylight from Open-Meteo. The moon phase is computed: the moon repeats its phases every 29.53 days, so days since a known new moon give the phase. |
| Orbital tracking | [CelesTrak](https://celestrak.org) TLEs | orbits 2 h, positions 2 s | Downloads each satellite's orbit as a *TLE* (two lines of numbers); the SGP4 model (`vendor/satellite.es.js`) predicts where the ISS and every GPS satellite is *now*. Sky plot: centre = straight up, edge = horizon, top = north. |
| Newsfeed | Google News RSS, via your relay | 10 min | Type a place and press Enter: English articles about it from the last 24 h. Remembered in this browser. |
| GNSS interference | [GPSJam](https://gpsjam.org), prepared daily by a GitHub Action | 1 h (data changes daily) | Airliners broadcast how accurate their GPS fix is. Where many aircraft report a bad fix, GPS is being jammed or spoofed. Red = >10% of aircraft affected. Hotspots are grouped into known zones (Baltic, Black Sea, Eastern Med, …). |
| Cyber attack vectors | [Cloudflare Radar](https://radar.cloudflare.com), via your relay | 30 min | Top country→country routes of HTTP attacks Cloudflare blocked in the last 24 h. "Origin" is where attack traffic came *from* (often hijacked machines), not necessarily where the attacker is. |
| Seismic activity | [USGS](https://earthquake.usgs.gov) | 5 min | Magnitude 2.5+ quakes of the last 24 h, the biggest, and the nearest to you. |
| Internet outages | [IODA](https://ioda.inetintel.cc.gatech.edu) (Georgia Tech) | 15 min | Countries where internet reachability dropped in the last 24 h, and which signal saw it (BGP routes, active probing, Google traffic). |
| Critical CVEs | [NVD](https://nvd.nist.gov) API 2.0 | 30 min | Critical (CVSS ≥ 9.0) CVEs published in the last 7 days. |

The header shows **ALL SYSTEMS NOMINAL**, or how many panels are online when some fail.
Your location (browser permission) only goes to Open-Meteo.

## Errors are loud on purpose
Every panel fails on its own and shows the reason in red (e.g. `HTTP 503 from services.nvd.nist.gov`).
Nothing falls back to fake or old data. `js/http.js` turns any non-2xx response or timeout into an error,
and `runPanel()` in `js/ui.js` catches it and prints it in that panel. Details also go to the browser console.

## CORS, and why some data goes through helpers
Browsers only let our page read another site's answer if that site sends the header
`Access-Control-Allow-Origin` (the **CORS** rule). CelesTrak, Open-Meteo, NVD, USGS and IODA send it.
Three sources don't, so they go through a helper:

| Source | Helper | Why this helper |
|---|---|---|
| Google News | relay (Cloudflare Worker) | live search on whatever place you type |
| Cloudflare Radar | relay | also needs a secret API token, which must never be in this public repo |
| GPSJam | GitHub Action, daily | data changes once a day, and its hexagon IDs need the `h3` library to become lat/lon |

No free flight-tracking API allows CORS either, which is why there is no flights panel.

### Relay setup (one time, ~10 min)
`relay/worker.js` is ~50 lines. It only forwards to Google News and Cloudflare Radar (it is not an open proxy) and only answers our github.io page.

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. **Workers & Pages** → **Create application** → **Hello World** → name it `friday-relay` → **Deploy**.
3. **Edit code**, replace everything with `relay/worker.js` → **Deploy**.
4. [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token** → permission **Account › Radar › Read** → create, copy the token.
5. Worker → **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name `RADAR_TOKEN`, paste the token → **Deploy**.
6. Put the Worker address (e.g. `https://friday-relay.<you>.workers.dev`, no trailing slash) in `js/config.js` and push.

Test: `https://friday-relay.<you>.workers.dev/news?q=Brussels` in a browser should show XML.
If you change `relay/worker.js`, paste it into Cloudflare again: the Worker does not update itself from GitHub.

### GPS jamming data
`.github/workflows/gpsjam.yml` runs `scripts/gpsjam.py` every day at 07:17 UTC (or by hand: Actions → gpsjam → Run workflow).
It downloads the newest day from gpsjam.org, keeps hexagons with ≥3 aircraft and ≥2% bad fixes, converts them to lat/lon,
and commits `data/gpsjam.json`. That push redeploys the site.

## Files
```
index.html            layout, one <section> per panel
style.css             the HUD look (arc reactor, corner brackets, glow, animations)
manifest.webmanifest  makes it installable ("Add to Home Screen")
js/main.js            wires each panel to its loader and refresh timer
js/http.js            fetch wrapper that throws on errors
js/ui.js              render helpers, runPanel() error handling, systems status
js/config.js          your relay address
js/worldmap.js        shared SVG world map (dots + attack arcs); land shapes in worldmap-data.js
js/countries-data.js  country centre points for the maps
js/<panel>.js         one file per data source: clock, satellites, weather, airquality, astro,
                      news, gpsjam, attacks, quakes, outages, cves (+ geo, location helpers)
relay/worker.js       the Cloudflare Worker relay
scripts/gpsjam.py     daily GPSJam converter (+ test_gpsjam.py)
data/gpsjam.json      output of the daily job
vendor/satellite.es.js  satellite.js 6.0.2 (MIT), copied as-is
tests/                unit tests (node --test)
```
Each data module has the same shape: `xxxUrl()` builds the request, `parseXxx()` turns raw JSON
into a small object (and throws if it looks wrong), `renderXxx()` makes the HTML. Parsing is
separate from fetching, which is what makes it testable without the internet.

## Run it locally
```bash
npm run serve      # then open http://localhost:8000
npm test           # JavaScript tests, needs Node 22+
cd scripts && pip install h3 && python -m unittest test_gpsjam   # Python tests
```
Opening `index.html` straight from disk does not work: browsers block JavaScript modules on `file://`.
The relay only answers the github.io address, so news and attacks show an error on localhost.

## Install on iPhone
Open the live link in **Safari** → Share → **Add to Home Screen**. Allow location when asked.

## Credits
Land shapes: Natural Earth (public domain). Country centres: mledoze/countries (ODbL).
Data: CelesTrak, Open-Meteo / Copernicus CAMS, NVD, Google News, GPSJam, Cloudflare Radar, USGS, IODA (Georgia Tech).
