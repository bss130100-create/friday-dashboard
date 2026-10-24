# friday-dashboard

**M.I.A.P. (Mihai's Intelligent Assist Platform)**: a JARVIS-style holographic HUD dashboard with live data.
Plain HTML + CSS + JavaScript: no framework, no build step. One Cloudflare Worker serves the files as they are,
plus the few helpers the page needs, and it sits behind a **Cloudflare Access login**: only you can open it.

**Live (login):** https://friday-relay.mcioroianu2.workers.dev

## Panels and how they work
Panels are grouped in five tabs: **Time** (chronometer, sun & moon), **Commute** (where I am, commute),
**Weather** (atmosphere, air quality & pollen), **News** (newsfeed, topic of the week) and **Global events**
(GNSS, cyber attacks, seismic, outages, orbital tracking, archive). The open tab is in the address (`#commute`), so a bookmark opens it.

| Panel | Source | Refresh | What happens |
|---|---|---|---|
| Chronometer | your device clock | 1 s | Local time, UTC, today's date and the **ISO week number** (weeks start Monday; week 1 holds the year's first Thursday). |
| Topic of the week | `data/topic.json` in this repo | 1 h | This week's topic, a fact of the day (rotates daily from the `start` date) and a watch list. Ticks are saved in this browser only. A new topic = Claude edits `data/topic.json` and pushes. |
| Commute · public transport | [Transitous](https://transitous.org) (free community journey planner, data from SNCB, STIB, De Lijn, TEC…) | 5 min | Four routes: Home → Work 1, Home → Work 2, Work 1 → Home, Work 2 → Home. Door to door with trains, buses, trams, metro and walking, live delays and cancellations, and "leave in N min". **Addresses are typed once under *setup* and saved in MIAP's private database (D1, behind the login), so every device you log in from has them. They are never in this public repo.** The Worker also checks the Access login token itself before reading or saving them. Transitous receives them to plan the trips. |
| Where I am · way home | your phone's GPS + Transitous | 2 min | Your precise position (GPS on a phone, Wi-Fi on a laptop) with its accuracy, the nearest street address, the distance to home, and the next trips home with "leave in N min". Needs the home address from Commute setup. |
| Atmosphere | [Open-Meteo](https://open-meteo.com) | 10 min | Current weather at your location. |
| Air quality · Pollen | Open-Meteo air quality (Copernicus CAMS model) | 30 min | European AQI (0-20 good … >100 extremely poor), particles, ozone, NO₂, and pollen. Pollen is only modelled for Europe. Pollen bands (<10 low, <50 moderate, else high, grains/m³) are a rough glance scale, not medical advice. |
| Sun · Moon | Open-Meteo + local maths | 1 h (countdown every min) | Sunrise/sunset/daylight from Open-Meteo. The moon phase is computed: the moon repeats its phases every 29.53 days, so days since a known new moon give the phase. |
| Orbital tracking | [CelesTrak](https://celestrak.org) TLEs | orbits 2 h, positions 2 s | Downloads each satellite's orbit as a *TLE* (two lines of numbers); the SGP4 model (`vendor/satellite.es.js`) predicts where the ISS and every GPS satellite is *now*. Shows the ISS height, speed and position, and how many GPS satellites are above you. Sky plot: centre = straight up, ring = horizon, top = north; hover a dot for its PRN. |
| Newsfeed | Bing News RSS, via the Worker | 10 min | Type a place and press Enter: English articles about it from the last 24 h. Remembered in this browser. |
| GNSS interference | [GPSJam](https://gpsjam.org), prepared daily by a GitHub Action | 1 h (data changes daily) | Airliners broadcast how accurate their GPS fix is. Where many aircraft report a bad fix, GPS is being jammed or spoofed. Red = >10% of aircraft affected. Hotspots are grouped into known zones (Baltic, Black Sea, Eastern Med, …). |
| Cyber attack vectors | [Cloudflare Radar](https://radar.cloudflare.com), via the Worker | 30 min | Top country→country routes of HTTP attacks Cloudflare blocked in the last 24 h. "Origin" is where attack traffic came *from* (often hijacked machines), not necessarily where the attacker is. |
| Seismic activity | [USGS](https://earthquake.usgs.gov) | 5 min | Magnitude 2.5+ quakes of the last 24 h, the biggest, and the nearest to you. |
| Internet outages | [IODA](https://ioda.inetintel.cc.gatech.edu) (Georgia Tech) | 15 min | Countries where internet reachability dropped in the last 24 h, and which signal saw it (BGP routes, active probing, Google traffic). |
| Archive · trends | your Worker's D1 database (`/history`) | 1 h | MIAP's memory: GNSS jamming per zone (120 days, top 4 zones, change vs previous week), earthquakes per day + biggest in 30 days + nearest to you in a year, and attack origin countries' share per day. Hover a chart for the exact value. Setup below. |

All maps show land, country borders (Natural Earth 1:110m) and country names. Names keep a readable size and more appear as you zoom in.

**Zoom (all four maps):** the + / − / ⟲ buttons, double-click, pinch on the phone, or pinch / Ctrl+scroll on a laptop. Drag to move around when zoomed. The zoom stays when the data refreshes.

The header shows **ALL SYSTEMS NOMINAL**, or how many panels are online when some fail.
Your location (browser permission) goes to Open-Meteo, and to Transitous for *Where I am*. It is never stored.

## Errors are loud on purpose
Every panel fails on its own and shows the reason in red (e.g. `HTTP 503 from earthquake.usgs.gov`).
Nothing falls back to fake or old data. `js/http.js` turns any non-2xx response or timeout into an error,
and `runPanel()` in `js/ui.js` catches it and prints it in that panel. Details also go to the browser console.

## CORS, and why some data goes through helpers
Browsers only let our page read another site's answer if that site sends the header
`Access-Control-Allow-Origin` (the **CORS** rule). CelesTrak, Open-Meteo, Transitous, USGS and IODA send it.
Three sources don't, so they go through a helper:

| Source | Helper | Why this helper |
|---|---|---|
| Bing News | the Worker | live search on whatever place you type (Google News was tried, but it answers Cloudflare servers with 503 "Sorry...") |
| Cloudflare Radar | the Worker | also needs a secret API token, which must never be in this public repo |
| GPSJam | GitHub Action, daily | data changes once a day, and its hexagon IDs need the `h3` library to become lat/lon |

No free flight-tracking API allows CORS either, which is why there is no flights panel.

### Hosting on Cloudflare (one time)
`wrangler.jsonc` describes the whole Worker: the site files (everything except what `.assetsignore` lists),
`relay/worker.js` for the helpers, the D1 memory and the hourly job. Cloudflare reads it on **every push to main**
and deploys by itself (Workers Builds), so nothing is ever pasted by hand.
`relay/worker.js` forwards only to Bing News and Cloudflare Radar (it is not an open proxy) and keeps MIAP's memory (below).

1. Free account at https://dash.cloudflare.com/sign-up, then **Workers & Pages** → **Create** → Hello World → name `friday-relay`.
2. [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token** → permission **Account › Radar › Read** → copy it.
   Worker → **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name `RADAR_TOKEN`, paste. The token never goes in this repo.
3. **D1 SQL database** (under Storage & databases) → **Create Database** → name `miap-memory`. Its **Database ID** is in `wrangler.jsonc` (an identifier, not a secret).
4. Worker → **Settings** → **Build** → **Connect** → GitHub → repo `friday-dashboard`, branch `main`, keep the deploy command `npx wrangler deploy`, untick **Enable Preview builds** → **Connect**.
   The first build starts with the next commit pushed to main.
5. **Login wall:** left menu **Zero Trust** → pick a team name → **Free** plan (asks for a card, charges nothing, up to 50 users).
   Then Worker → **Access** tab → **Protect this Worker behind Access** → **All traffic** → policy: **Emails** = your address
   → session duration **1 month** → **Apply Access**. You log in with a code sent to that email.

Builds and their logs: Worker → **Deployments**. The hourly job's runs and errors: Worker → **Settings** → **Trigger Events** → **View events**.
When the login expires, panels say "login expired? reload the page": reloading shows the login screen.

### MIAP memory: trends
The **Archive · trends** panel reads history the Worker saves into a free Cloudflare **D1** database
(SQL, 5 GB and 100k writes/day free; MIAP uses about 2k writes/day). Every hour the Worker's
`scheduled()` handler stores: every M2.5+ earthquake (USGS), GNSS interference per hot zone
(from `data/gpsjam.json`, read through the Worker's own assets), and the day's attack routes (Radar).
Tables are created on the first run, and the first run also loads 120 days of GNSS history from `data/gnss-backfill.json`.
The database binding (`DB`) and the hourly cron (`0 * * * *`) are in `wrangler.jsonc`.

### GPS jamming data
`.github/workflows/gpsjam.yml` runs `scripts/gpsjam.py` every day at 07:17 UTC (or by hand: Actions → gpsjam → Run workflow).
It downloads the newest day from gpsjam.org, keeps hexagons with ≥3 aircraft and ≥2% bad fixes, converts them to lat/lon,
counts them per hot zone (the zones are defined in `scripts/gpsjam.py`), and commits `data/gpsjam.json`. That push redeploys MIAP.
If `data/gnss-backfill.json` is missing it also builds it once (120 past days, per zone).

## Files
```
index.html            layout, one <section> per panel
style.css             the HUD look (arc reactor, corner brackets, glow, animations)
manifest.webmanifest  makes it installable ("Add to Home Screen")
js/main.js            wires each panel to its loader and refresh timer
js/http.js            fetch wrapper that throws on errors
js/ui.js              render helpers, runPanel() error handling, systems status
js/worldmap.js        shared SVG world map (dots + attack arcs); land shapes in worldmap-data.js, borders in borders-data.js
js/zoom.js            zoom and drag for the maps
js/history.js         trends panel (reads /history); js/charts.js tiny SVG charts
js/countries-data.js  country centre points for the maps; js/labels-data.js country names
js/<panel>.js         one file per data source: clock, satellites, weather, airquality, astro,
                      news, gpsjam, attacks, quakes, outages, topic, commute (+ geo, location helpers)
relay/worker.js       the Cloudflare Worker: helpers (news, attacks) + memory
wrangler.jsonc        how Cloudflare deploys it (site files, database, hourly job); .assetsignore = files not served
scripts/gpsjam.py     daily GPSJam converter (+ test_gpsjam.py)
data/gpsjam.json      output of the daily job
data/topic.json       topic of the week (facts + videos)
vendor/satellite.es.js  satellite.js 6.0.2 (MIT), copied as-is
tests/                unit tests (node --test)
```
Each data module has the same shape: `xxxUrl()` builds the request, `parseXxx()` turns raw JSON
into a small object (and throws if it looks wrong), `renderXxx()` makes the HTML. Parsing is
separate from fetching, which is what makes it testable without the internet.

## Run it locally
```bash
npm run serve      # the whole Worker locally (site + helpers + a local database), open http://localhost:8787
npm test           # JavaScript tests, needs Node 22+
cd scripts && pip install h3 && python -m unittest test_gpsjam   # Python tests
```
Opening `index.html` straight from disk does not work: browsers block JavaScript modules on `file://`.
Attacks need `RADAR_TOKEN`: put `RADAR_TOKEN=...` in a file named `.dev.vars` (never commit it).

## Install on iPhone
Open the live link in **Safari**, log in, then Share → **Add to Home Screen**. Allow location when asked.

## Credits
Land shapes: Natural Earth (public domain). Country centres: mledoze/countries (ODbL).
Data: Transitous (© OpenStreetMap contributors, [sources](https://transitous.org/sources/)), CelesTrak, Open-Meteo / Copernicus CAMS, Bing News, GPSJam, Cloudflare Radar, USGS, IODA (Georgia Tech).

## License
MIT, see [LICENSE](LICENSE). `vendor/satellite.es.js` keeps its own MIT license; map data is public domain (Natural Earth).
