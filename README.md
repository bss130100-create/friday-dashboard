# friday-dashboard

**M.I.A.P. (Mihai's Intelligent Assist Platform)**: a JARVIS-style holographic HUD dashboard with live data.
Plain HTML + CSS + JavaScript: no framework, no build step. One Cloudflare Worker serves the files as they are,
plus the few helpers the page needs, and it sits behind a **Cloudflare Access login**: only you can open it.

**Live (login):** https://friday-relay.mcioroianu2.workers.dev

## Panels and how they work
Panels are grouped in four tabs: **Today** (AI briefing, commute, days off & holidays, topic of the week, electricity, chronometer, sun & moon),
**Commute** (commute, roads & rail, where I am), **Weather** (atmosphere, one weather map with a Temperature/Wind/Rain switch, air quality & pollen) and
**Intel** (newsfeed, GNSS, cyber attacks, archive). **System** (MIAP's health, phone alerts, home and work addresses) has no tab button:
tap the arc reactor logo. The open tab is in the address (`#commute`, `#system`), so a bookmark opens it.
**Edit** (next to the tab's title) folds the cards into rows you drag into your own order (or move with the arrow keys);
the order is saved per tab in MIAP's database (`/settings/layout`), so every device shows the same layout. "Reset to default order" undoes it.
Cards with more detail open in place (the button under them); the open state survives the next refresh.

| Panel | Source | Refresh | What happens |
|---|---|---|---|
| AI briefing | Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) via the Worker | 1 h, or **Brief me** | The text the other panels show (commute, where I am, roads & rail, weather, air, sun, days off, holidays, electricity, news, topic) goes to the Worker's `/briefing`; Llama 3.3 70B answers in JSON (Workers AI JSON mode): a summary of at most 3 sentences, action first, aware of the day and time (to work on weekday mornings, home in the evening, nothing about work at weekends), plus up to 3 updates, 3 things coming up and 3 recommended actions, which open under the summary. Panels in error are left out, and so is the work commute on Saturday and Sunday. The logo pulses while MIAP is writing it. Free plan: 10,000 neurons a day, one briefing costs about 110. |
| Chronometer | your device clock | 1 s | Local time, then UTC, today's date and the **ISO week number** (weeks start Monday; week 1 holds the year's first Thursday). |
| Days off | [OpenHolidays API](https://www.openholidaysapi.org) (free, no key) | 6 h | Days to the next Belgian public holiday, what that day means for a Mon–Fri week, and the next long weekend. Easter and Pentecost Sunday are left out: they are not among Belgium's 10 paid holidays. **Show all** opens the holidays timeline: every public holiday of the next 12 months with what it means for a Mon–Fri week (long weekend, one day of leave for a 4-day weekend, midweek, or a weekend day that gives a replacement day) and the French- and Dutch-speaking school holidays (both run in Brussels; one entry when the dates match). |
| Commute (Today) | the Commute tab's load | 5 min | One sentence first: a cancelled or 5+ min late trip in the next hour on the routes that matter now (to work before noon, home after), or "No delays or cancellations". Then the next departure per route. On weekends: no work commute. |
| Electricity · Belgium | Sibelga rate periods + [Energy-Charts](https://www.energy-charts.info) (Fraunhofer ISE, CC BY 4.0) via the Worker + OpenHolidays | 15 min (Worker caches 30 min) | Made for a fixed-price contract with a day/night (bi-horaire) meter in Brussels: whether the cheap night rate is on now and when it changes (night = 22:00–07:00 on weekdays, all day on weekends and public holidays, per Brugel), plus the forecast renewable share of Belgian demand per hour (bars; over 100% = Belgium exports the surplus) and the greenest 3-hour window. |
| Topic of the week | `data/topic.json` in this repo | 1 h | This week's topic, a fact of the day (rotates daily from the `start` date) and a watch list. Ticks are saved in this browser only. A new topic = Claude edits `data/topic.json` and pushes. |
| Commute · public transport | [Transitous](https://transitous.org) (free community journey planner, data from SNCB, STIB, De Lijn, TEC…) | 5 min | Four routes: Here (your current GPS position) → Work 1, Here → Work 2, Work 1 → Home, Work 2 → Home, each showing the 2 fastest of the next 6 trips. Door to door with trains, buses, trams, metro and walking, live delays and cancellations, and "leave in N min". **Addresses are typed once under *setup* and saved in MIAP's private database (D1, behind the login), so every device you log in from has them. They are never in this public repo.** The Worker also checks the Access login token itself before reading or saving them. Transitous receives them to plan the trips. |
| Where I am · way home | your phone's GPS + Transitous | 2 min | Your precise position (GPS on a phone, Wi-Fi on a laptop) with its accuracy, the nearest street address, the distance to home, and the next trips home with "leave in N min". Needs the home address saved in System. |
| Phone alerts | the Worker's cron + Transitous, iRail → Web Push | 5 min | Pushes to your phone, once per event. Weekdays 08:00–09:00 (routes to work) and 15:30–17:30 (routes home), Brussels time: a trip leaving in the next hour is cancelled, runs 5+ min late, or a live SNCB disruption names one of its stations. See *Phone alerts* below. |
| Atmosphere | [Open-Meteo](https://open-meteo.com) | 10 min | Current weather at your location. |
| Weather map (Temperature · Wind) | [Open-Meteo](https://open-meteo.com) | 30 min | One map with a **Temperature / Wind / Rain** switch. Current temperature (coloured 5 °C bands) and wind (arrow = where it blows to, number = km/h) on a 7 × 7 grid of points 20 km apart, ~120 km around you. All 49 points come in ONE request, which Open-Meteo counts as about one call of its free 10,000 a day. |
| Weather map (Rain) | [RainViewer](https://www.rainviewer.com) | 10 min | The latest radar picture (at most 10 min old) over the same area. Free for personal use since 2026 only past radar, one colour scheme and detail up to zoom 7, so it looks soft when you zoom far in. |
| Air quality · Pollen | Open-Meteo air quality (Copernicus CAMS model) | 30 min | European AQI (0-20 good … >100 extremely poor), particles, ozone, NO₂, and pollen. Pollen is only modelled for Europe. Pollen bands (<10 low, <50 moderate, else high, grains/m³) are a rough glance scale, not medical advice. |
| Sun · Moon | Open-Meteo + local maths | 1 h (countdown every min) | Sunrise/sunset/daylight from Open-Meteo. The moon phase is computed: the moon repeats its phases every 29.53 days, so days since a known new moon give the phase. |
| Newsfeed | Bing News RSS, via the Worker | 10 min | Type a place and press Enter: English articles about it from the last 24 h. Remembered in this browser. |
| Roads & rail around you | [TomTom](https://developer.tomtom.com) traffic incidents via the Worker + SNCB disruptions via [iRail](https://api.irail.be) | 15 min | Roads: closures, accidents, jams and roadworks in a ~78 × 78 km box around you, worst first, with delay and length. TomTom's free plan is 2,500 calls a month, so the Worker caches each ~20 km cell for 30 min and only that rounded cell is sent. Rail: current disruptions and planned works whose title names a station within 30 km of you, plus how many others there are in Belgium. Map (~50 km across, centred on you, zoom and drag): red = closed roads, dashed red = live rail disruptions (drawn station to station: iRail names the stretch, not the track), orange = jams, accidents, lane closures. Tap a line for details. |
| GNSS interference | [GPSJam](https://gpsjam.org), prepared daily by a GitHub Action | 1 h (data changes daily) | Airliners broadcast how accurate their GPS fix is. Where many aircraft report a bad fix, GPS is being jammed or spoofed. Red = >10% of aircraft affected. Hotspots are grouped into known zones (Baltic, Black Sea, Eastern Med, …). |
| Cyber attack vectors | [Cloudflare Radar](https://radar.cloudflare.com), via the Worker | 30 min | Top country→country routes of HTTP attacks Cloudflare blocked in the last 24 h. "Origin" is where attack traffic came *from* (often hijacked machines), not necessarily where the attacker is. |
| Archive · trends | your Worker's D1 database (`/history`) | 1 h | MIAP's memory: GNSS jamming per zone (120 days, top 4 zones, change vs previous week) and attack origin countries' share per day. Hover a chart for the exact value. Setup below. |

All maps show land, country borders (Natural Earth 1:110m) and country names. Names keep a readable size and more appear as you zoom in.

**Zoom (both world maps):** the + / − / ⟲ buttons, double-click, pinch on the phone, or pinch / Ctrl+scroll on a laptop. Drag to move around when zoomed. The zoom stays when the data refreshes.

The header says **All N panels live**, names the panels that need attention when some fail (amber), or how many are still connecting; the segments under it show each panel.
Your location (browser permission) goes to Open-Meteo, and to Transitous for *Where I am*. It is never stored.

## Errors are loud on purpose
Every panel fails on its own and shows the reason in red (e.g. `HTTP 503 from api.open-meteo.com`).
Nothing falls back to fake or old data. `js/http.js` turns any non-2xx response or timeout into an error,
and `runPanel()` in `js/ui.js` catches it and prints it in that panel. Details also go to the browser console.

## CORS, and why some data goes through helpers
Browsers only let our page read another site's answer if that site sends the header
`Access-Control-Allow-Origin` (the **CORS** rule). Open-Meteo, Transitous, OpenHolidays and iRail send it.
Four sources don't, so they go through a helper:

| Source | Helper | Why this helper |
|---|---|---|
| Bing News | the Worker | live search on whatever place you type (Google News was tried, but it answers Cloudflare servers with 503 "Sorry...") |
| Energy-Charts | the Worker | its answers only allow its own site (CORS); the Worker also caches them 30 min in D1 |
| Cloudflare Radar | the Worker | also needs a secret API token, which must never be in this public repo |
| GPSJam | GitHub Action, daily | data changes once a day, and its hexagon IDs need the `h3` library to become lat/lon |

No free flight-tracking API allows CORS either, which is why there is no flights panel.

### Hosting on Cloudflare (one time)
`wrangler.jsonc` describes the whole Worker: the site files (everything except what `.assetsignore` lists),
`relay/worker.js` for the helpers, the D1 memory and the hourly job. Cloudflare reads it on **every push to main**
and deploys by itself (Workers Builds), so nothing is ever pasted by hand.
`relay/worker.js` forwards only to Bing News and Cloudflare Radar (it is not an open proxy) and keeps MIAP's memory (below). To stay well inside the free limits it keeps answers in the D1 `cache` table: Radar 15 min (shared by the page and the hourly snapshot), TomTom 30 min, and the Access login keys 1 h (fetched again at once if Cloudflare rotates them).

1. Free account at https://dash.cloudflare.com/sign-up, then **Workers & Pages** → **Create** → Hello World → name `friday-relay`.
2. [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token** → permission **Account › Radar › Read** → copy it.
   Worker → **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name `RADAR_TOKEN`, paste. The token never goes in this repo.
3. **D1 SQL database** (under Storage & databases) → **Create Database** → name `miap-memory`. Its **Database ID** is in `wrangler.jsonc` (an identifier, not a secret).
4. Worker → **Settings** → **Build** → **Connect** → GitHub → repo `friday-dashboard`, branch `main`, keep the deploy command `npx wrangler deploy`, untick **Enable Preview builds** → **Connect**.
   The first build starts with the next commit pushed to main.
5. **Login wall:** left menu **Zero Trust** → pick a team name → **Free** plan (asks for a card, charges nothing, up to 50 users).
   Then Worker → **Access** tab → **Protect this Worker behind Access** → **All traffic** → policy: **Emails** = your address
   → session duration **1 month** → **Apply Access**. You log in with a code sent to that email.

### Cloudflare usage (System tab)
The **System status** panel shows MIAP's own health: Worker requests today against the free 100,000, errors and CPU time
over 24 h, Workers AI neurons against the free 10,000 a day, and the D1 database's size and rows read/written against
its free limits (from Cloudflare's GraphQL Analytics API, asked at most every 10 min). It also lists which routes answered
with errors and how the scheduled jobs ran; MIAP records those itself in D1 (`route_errors`, `cron_runs`, 7 days).
The **Delete data older than 30 days** button (asks first, needs your login) removes old GNSS and attack days,
error counts and cache rows; saved addresses and phone alerts stay. Archive · trends then only goes back 30 days.

It needs two Worker secrets (Worker → **Settings** → **Variables and Secrets** → **Add** → type **Secret**):
1. `CF_API_TOKEN`: [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token** →
   permission **Account › Account Analytics › Read** (nothing else) → copy it. It never goes in this repo.
2. `CF_ACCOUNT_ID`: **Workers & Pages** overview, right-hand column, **Account ID**.

Builds and their logs: Worker → **Deployments**. The hourly job's runs and errors: Worker → **Settings** → **Trigger Events** → **View events**.
When the login expires, panels say "login expired? reload the page": reloading shows the login screen.

**Roads (one time, ~3 min):** free account at https://developer.tomtom.com (no card) → **Dashboard** → **Keys** → copy the default key →
Worker → **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name `TOMTOM_KEY`, paste → **Deploy**.
Until then the roads half of *Roads & rail* says `TOMTOM_KEY secret is not set`. The AI briefing needs nothing: `wrangler.jsonc` binds Workers AI as `AI`.

### MIAP memory: trends
The **Archive · trends** panel reads history the Worker saves into a free Cloudflare **D1** database
(SQL, 5 GB and 100k writes/day free; MIAP uses about 2k writes/day). Every hour the Worker's
`scheduled()` handler stores: GNSS interference per hot zone
(from `data/gpsjam.json`, read through the Worker's own assets), and the day's attack routes (Radar).
Tables are created on the first run, and the first run also loads 120 days of GNSS history from `data/gnss-backfill.json`.
The database binding (`DB`) and the hourly cron (`0 * * * *`) are in `wrangler.jsonc`.

### Phone alerts (Web Push)
Nothing to set up on Cloudflare. The Worker makes its own push key pair (VAPID) on first use and keeps it in D1
(`settings` table, key `vapid`); devices are in `push_subs`, sent alerts in `alerts_sent` (kept 3 days, so nothing is pushed twice).
Messages are encrypted for the device (RFC 8291) with the built-in WebCrypto; see `relay/push.js`.
The rules are in `relay/alerts.js`. A second cron (`*/5 * * * *`) runs the commute check; outside the windows it stops before
any request. Cost per weekday: ~100 Transitous + ~50 iRail requests, all well inside free limits.

**On iPhone (iOS 16.4+):** MIAP must be opened from its Home Screen icon (Safari tabs can't receive pushes) →
Commute tab → **Enable alerts** → Allow → **Send test**. Turn off: Settings → Notifications → MIAP.

### GPS jamming data
`.github/workflows/gpsjam.yml` runs `scripts/gpsjam.py` every day at 07:17 UTC (or by hand: Actions → gpsjam → Run workflow).
It downloads the newest day from gpsjam.org, keeps hexagons with ≥3 aircraft and ≥2% bad fixes, converts them to lat/lon,
counts them per hot zone (the zones are defined in `scripts/gpsjam.py`), and commits `data/gpsjam.json`. That push redeploys MIAP.
If `data/gnss-backfill.json` is missing it also builds it once (120 past days, per zone).

## Files
```
index.html            layout, one <section> per panel
tokens.css            design tokens: every colour, iOS text style, spacing step, radius and animation speed
style.css             the look, built only from tokens.css: 50% Iron Man frame (HUD labels, corner brackets,
                      cyan readouts), 50% Apple content (text styles, list rows, 44px tap targets)
manifest.webmanifest  makes it installable ("Add to Home Screen")
js/main.js            wires each panel to its loader and refresh timer
js/http.js            fetch wrapper that throws on errors
js/ui.js              render helpers, runPanel() error handling, systems status
js/worldmap.js        shared SVG world map (dots + attack arcs); land shapes in worldmap-data.js, borders in borders-data.js
js/zoom.js            zoom and drag for the maps
js/history.js         trends panel (reads /history); js/charts.js tiny SVG charts
js/countries-data.js  country centre points for the maps; js/labels-data.js country names
js/<panel>.js         one file per data source: clock, weather, airquality, astro,
                      news, gpsjam, attacks, topic, commute, daysoff, power (+ geo, location helpers)
relay/worker.js       the Cloudflare Worker: helpers (news, attacks, power), memory, settings, roads, briefing, push endpoints + cron
relay/alerts.js       when to push (commute windows, delays, cancellations, rail disruptions)
relay/push.js         Web Push sender (VAPID + encryption, no library)
sw.js                 service worker: shows the alerts on the phone; js/alerts.js = the Enable alerts panel
wrangler.jsonc        how Cloudflare deploys it (site files, database, AI, hourly + 5-minute jobs); .assetsignore = files not served
scripts/gpsjam.py     daily GPSJam converter (+ test_gpsjam.py)
data/gpsjam.json      output of the daily job
data/topic.json       topic of the week (facts + videos)
vendor/leaflet.*      Leaflet 1.9.4 (BSD-2), copied as-is: draws the maps (js/basemap.js; roads & rail in js/trafficmap.js, weather in js/weathermap.js)
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
Land shapes: Natural Earth (public domain). Maps: © OpenStreetMap contributors (tiles), Leaflet, RainViewer (radar). Country centres: mledoze/countries (ODbL).
Data: OpenHolidays, Energy-Charts (Fraunhofer ISE, CC BY 4.0), Transitous (© OpenStreetMap contributors, [sources](https://transitous.org/sources/)), Open-Meteo / Copernicus CAMS, Bing News, GPSJam, Cloudflare Radar.

## License
MIT, see [LICENSE](LICENSE). `vendor/leaflet.*` keeps its own BSD-2 license; map data is public domain (Natural Earth).
