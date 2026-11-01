# Graph Report - friday-dashboard  (2026-11-01)

## Corpus Check
- 78 files · ~98,279 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .css 2, .webmanifest 1)

## Summary
- 761 nodes · 1813 edges · 35 communities (30 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50ce4bfe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- commute.js
- panels.test.js
- leaflet.esm.js
- fetchJson
- ref_node_assert
- daysoff.js
- esc
- gpsjam.py
- weathermap.js
- worker.js
- system.test.js
- alerts.test.js
- memory.test.js
- steps
- addOne
- steps
- friday-dashboard
- openDb
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
2. `fetchJson()` - 37 edges
3. `openDb()` - 18 edges
4. `sendJson()` - 13 edges
5. `commuteSummary()` - 11 edges
6. `renderPower()` - 11 edges
7. `showBody()` - 11 edges
8. `loadHere()` - 10 edges
9. `renderSystem()` - 10 edges
10. `expander()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Errors are loud on purpose` --references--> `runPanel()`  [INFERRED]
  README.md → js/ui.js
- `Phone alerts (Web Push)` --references--> `settings()`  [INFERRED]
  README.md → relay/worker.js
- `MIAP memory: trends` --references--> `scheduled()`  [INFERRED]
  README.md → relay/worker.js
- `Hosting on Cloudflare (one time)` --references--> `main()`  [INFERRED]
  README.md → scripts/gpsjam.py
- `tripEvents()` --indirect_call--> `normalize()`  [INFERRED]
  relay/alerts.js → js/rail.js

## Import Cycles
- None detected.

## Communities (35 total, 5 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.05
Nodes (72): alertState(), enableAlerts(), keyBytes(), loadPushKey(), renderAlerts(), sendTest(), supported(), UNSUPPORTED (+64 more)

### Community 1 - "commute.js"
Cohesion: 0.09
Nodes (48): brusselsHour(), commuteSummary(), commuteVerdict(), DELAY_MIN, fastest(), geocode(), geocodeUrl(), hhmm() (+40 more)

### Community 2 - "panels.test.js"
Cohesion: 0.07
Nodes (43): airUrl(), aqiBand(), loadAir(), parseAir(), POLLEN, pollenBand(), renderAir(), astroUrl() (+35 more)

### Community 3 - "leaflet.esm.js"
Cohesion: 0.04
Nodes (7): RFC-7946, create$1(), createCorner(), setOpacity(), _setOpacityIE(), toTransformation(), Transformation()

### Community 4 - "fetchJson"
Cohesion: 0.10
Nodes (38): loadLeaflet(), mapPanel(), maps, resizeMaps(), viewBounds(), fetchJson(), DISTURBANCES_URL, mentions() (+30 more)

### Community 5 - "ref_node_assert"
Cohesion: 0.10
Nodes (29): isoWeek(), renderClock(), bearingDeg(), compassPoint(), toDeg(), toRad(), packPanels(), PANEL_GAP_PX (+21 more)

### Community 6 - "daysoff.js"
Cohesion: 0.12
Nodes (31): addDays(), bridge(), brusselsToday(), COMMUNITIES, daysBetween(), holidaysUrl(), holidayTimeline(), inDays() (+23 more)

### Community 7 - "esc"
Cohesion: 0.14
Nodes (33): barChart(), f(), lineChart(), dailySeries(), historyUrl(), loadHistory(), renderAttackHistory(), renderGnssHistory() (+25 more)

### Community 8 - "gpsjam.py"
Cohesion: 0.12
Nodes (10): classify(), dates(), download(), history(), hotspots(), latest_date(), main(), region_counts() (+2 more)

### Community 9 - "weathermap.js"
Cohesion: 0.16
Nodes (27): drawWeatherMap(), at(), bilinear(), colorAt(), fieldBounds(), fieldImage(), gridPoints(), gridSummary() (+19 more)

### Community 10 - "worker.js"
Cohesion: 0.12
Nodes (27): accessKeys(), base64url(), BRIEF_RULES, BRIEF_SCHEMA, cached(), decodeToken(), everyFiveMinutes(), fetch() (+19 more)

### Community 11 - "system.test.js"
Cohesion: 0.12
Nodes (22): PRUNE_QUESTION, renderPruned(), account(), AI_QUERY, D1_DATABASE_ID, D1_QUERY, GRAPHQL_URL, ms() (+14 more)

### Community 12 - "alerts.test.js"
Cohesion: 0.14
Nodes (19): RFC-8292, b64url(), concat(), enc, encrypt(), hmac(), RFC-8291, newVapidKeys() (+11 more)

### Community 13 - "memory.test.js"
Cohesion: 0.12
Nodes (19): assetJson(), attackRows(), briefing(), briefingMessages(), gnssRows(), historyQuery(), parseBrief(), radarAttacks() (+11 more)

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

### Community 18 - "openDb"
Cohesion: 0.19
Nodes (14): history(), hourOf(), needDb(), notify(), openDb(), ownHealth(), prune(), pushKey() (+6 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 202 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Hosting on Cloudflare (one time)` connect `friday-dashboard` to `gpsjam.py`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **What connects `RFC-8292`, `RFC-8291`, `RFC-8291` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.051055867415129644 - nodes in this community are weakly interconnected._
- **Why does `main()` connect `gpsjam.py` to `friday-dashboard`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Should `commute.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08636363636363636 - nodes in this community are weakly interconnected._
- **Should `panels.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06801346801346801 - nodes in this community are weakly interconnected._
- **Should `leaflet.esm.js` be split into smaller, more focused modules?**
  _Cohesion score 0.04072398190045249 - nodes in this community are weakly interconnected._