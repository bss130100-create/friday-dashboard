# Graph Report - friday-dashboard  (2026-11-14)

## Corpus Check
- 77 files · ~98,679 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .css 2, .webmanifest 1)

## Summary
- 765 nodes · 1831 edges · 32 communities (27 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 77 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5ac3fb2a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- commute.js
- fetchJson
- leaflet.esm.js
- traffic.test.js
- ref_node_assert
- daysoff.js
- esc
- gpsjam.py
- weathermap.js
- worker.js
- push.js
- steps
- addOne
- steps
- friday-dashboard
- arrange.js
- polygonCenter
- .extend
- Point
- package.json
- frame
- off
- _simplifyDPStep
- addClass
- _addPointerDocListener
- geometryToLayer
- CLAUDE.md
- .claude/CLAUDE.md
- Handler

## God Nodes (most connected - your core abstractions)
1. `esc()` - 59 edges
2. `fetchJson()` - 35 edges
3. `openDb()` - 18 edges
4. `sendJson()` - 13 edges
5. `showBody()` - 12 edges
6. `commuteSummary()` - 11 edges
7. `renderPower()` - 11 edges
8. `renderSystem()` - 11 edges
9. `loadHere()` - 10 edges
10. `expander()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Errors are loud on purpose` --references--> `runPanel()`  [INFERRED]
  README.md → js/ui.js
- `MIAP memory: trends` --references--> `scheduled()`  [INFERRED]
  README.md → relay/worker.js
- `subscription()` --calls--> `b64url()`  [EXTRACTED]
  tests/alerts.test.js → relay/push.js
- `watchedRoutes()` --calls--> `routes()`  [EXTRACTED]
  relay/alerts.js → js/commute.js
- `commuteEvents()` --calls--> `planUrl()`  [EXTRACTED]
  relay/alerts.js → js/commute.js

## Import Cycles
- None detected.

## Communities (32 total, 5 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.05
Nodes (67): alertState(), enableAlerts(), keyBytes(), loadPushKey(), renderAlerts(), sendTest(), supported(), UNSUPPORTED (+59 more)

### Community 1 - "commute.js"
Cohesion: 0.10
Nodes (42): brusselsHour(), commuteSummary(), commuteVerdict(), fastest(), geocode(), geocodeUrl(), hhmm(), isWeekend() (+34 more)

### Community 2 - "fetchJson"
Cohesion: 0.07
Nodes (47): airUrl(), aqiBand(), loadAir(), parseAir(), POLLEN, pollenBand(), renderAir(), astroUrl() (+39 more)

### Community 3 - "leaflet.esm.js"
Cohesion: 0.04
Nodes (7): RFC-7946, create$1(), createCorner(), setOpacity(), _setOpacityIE(), toTransformation(), Transformation()

### Community 4 - "traffic.test.js"
Cohesion: 0.09
Nodes (44): loadLeaflet(), mapPanel(), maps, resizeMaps(), viewBounds(), DELAY_MIN, DISTURBANCES_URL, mentions() (+36 more)

### Community 5 - "ref_node_assert"
Cohesion: 0.10
Nodes (29): isoWeek(), renderClock(), bearingDeg(), compassPoint(), toDeg(), toRad(), packPanels(), PANEL_GAP_PX (+21 more)

### Community 6 - "daysoff.js"
Cohesion: 0.09
Nodes (42): addDays(), bridge(), brusselsToday(), COMMUNITIES, daysBetween(), holidaysUrl(), holidayTimeline(), inDays() (+34 more)

### Community 7 - "esc"
Cohesion: 0.13
Nodes (34): barChart(), f(), lineChart(), dailySeries(), historyUrl(), loadHistory(), renderAttackHistory(), renderGnssHistory() (+26 more)

### Community 8 - "gpsjam.py"
Cohesion: 0.12
Nodes (10): classify(), dates(), download(), history(), hotspots(), latest_date(), main(), region_counts() (+2 more)

### Community 9 - "weathermap.js"
Cohesion: 0.16
Nodes (27): drawWeatherMap(), at(), bilinear(), colorAt(), fieldBounds(), fieldImage(), gridPoints(), gridSummary() (+19 more)

### Community 10 - "worker.js"
Cohesion: 0.05
Nodes (80): account(), AI_QUERY, D1_DATABASE_ID, D1_QUERY, GRAPHQL_URL, ms(), parseAi(), parseD1() (+72 more)

### Community 12 - "push.js"
Cohesion: 0.25
Nodes (14): RFC-8292, b64url(), concat(), enc, encrypt(), hmac(), RFC-8291, newVapidKeys() (+6 more)

### Community 14 - "steps"
Cohesion: 0.12
Nodes (16): jobs, update, name, on, schedule, workflow_dispatch, permissions, contents (+8 more)

### Community 15 - "addOne"
Cohesion: 0.13
Nodes (17): addDoubleTapListener(), simDblclick(), addOne(), disableClickPropagation(), disableImageDrag(), disableScrollPropagation(), enableImageDrag(), getPropagationPath() (+9 more)

### Community 16 - "steps"
Cohesion: 0.13
Nodes (14): jobs, test, name, on, pull_request, push, run, uses (+6 more)

### Community 17 - "friday-dashboard"
Cohesion: 0.13
Nodes (14): Cloudflare usage (System tab), CORS, and why some data goes through helpers, Credits, Errors are loud on purpose, Files, friday-dashboard, GPS jamming data, Hosting on Cloudflare (one time) (+6 more)

### Community 19 - "arrange.js"
Cohesion: 0.33
Nodes (9): follows(), middle(), startArrange(), drag(), loadLayout(), orderIds(), parseLayout(), saveLayout() (+1 more)

### Community 20 - "polygonCenter"
Cohesion: 0.23
Nodes (13): centroid(), coordsToLatLng(), _flat(), formatNum(), isFlat(), LatLng(), latLngsToCoords(), latLngToCoords() (+5 more)

### Community 21 - ".extend"
Cohesion: 0.21
Nodes (8): asFeature(), Bounds(), checkDeprecatedMixinEvents(), Class(), getFeature(), LatLngBounds(), setOptions(), toBounds()

### Community 22 - "Point"
Cohesion: 0.22
Nodes (10): clipPolygon(), clipSegment(), _getBitCode(), _getEdgeIntersection(), getMousePosition(), getPosition(), getScale(), Point() (+2 more)

### Community 23 - "package.json"
Cohesion: 0.22
Nodes (8): description, license, name, private, scripts, serve, test, type

### Community 24 - "frame"
Cohesion: 0.31
Nodes (9): bind(), cosh(), easeOut(), frame(), requestAnimFrame(), sinh(), tanh(), u() (+1 more)

### Community 25 - "off"
Cohesion: 0.29
Nodes (8): batchRemove(), indexOf(), off(), preventOutline(), removeDoubleTapListener(), removeOne(), removePointerListener(), restoreOutline()

### Community 26 - "_simplifyDPStep"
Cohesion: 0.25
Nodes (8): closestPointOnSegment(), pointToSegmentDistance(), _reducePoints(), simplify(), _simplifyDP(), _simplifyDPStep(), _sqClosestPointOnSegment(), _sqDist()

### Community 27 - "addClass"
Cohesion: 0.43
Nodes (7): addClass(), getClass(), hasClass(), removeClass(), setClass(), splitWords(), trim()

### Community 28 - "_addPointerDocListener"
Cohesion: 0.40
Nodes (5): _addPointerDocListener(), addPointerListener(), _globalPointerDown(), _globalPointerMove(), _globalPointerUp()

### Community 29 - "geometryToLayer"
Cohesion: 0.67
Nodes (3): coordsToLatLngs(), geometryToLayer(), _pointToLayer()

## Knowledge Gaps
- **4 isolated node(s):** `RFC-8292`, `RFC-8291`, `RFC-8291`, `RFC-7946`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 204 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `esc()` connect `esc` to `main.js`, `commute.js`, `fetchJson`, `traffic.test.js`, `ref_node_assert`, `daysoff.js`, `weathermap.js`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `RFC-8292`, `RFC-8291`, `RFC-8291` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.051189400782896716 - nodes in this community are weakly interconnected._
- **Why does `runPanel()` connect `main.js` to `friday-dashboard`, `fetchJson`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `commute.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09608843537414966 - nodes in this community are weakly interconnected._
- **Should `fetchJson` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._
- **Should `leaflet.esm.js` be split into smaller, more focused modules?**
  _Cohesion score 0.04072398190045249 - nodes in this community are weakly interconnected._