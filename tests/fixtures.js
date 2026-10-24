// Real data captured from the APIs on 2026-10-24, trimmed.
export const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991
2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752
`;

export const GPS_TLE = `GPS BIIR-5  (PRN 22)
1 26407U 00040A   26297.16843065  .00000013  00000+0  00000+0 0  9994
2 26407  54.8296 210.0447 0116091 304.6851 227.9403  2.00558693192533
GPS BIIR-8  (PRN 16)
1 27663U 03005A   26296.99218260  .00000012  00000+0  00000+0 0  9995
2 27663  54.8590 209.8568 0152309  54.1381 126.7246  2.00553584173895
`;

export const WEATHER_JSON = {
  current: {
    temperature_2m: 14.1, apparent_temperature: 12.9, relative_humidity_2m: 71,
    wind_speed_10m: 2.6, wind_direction_10m: 270, pressure_msl: 1016.4, weather_code: 3,
  },
};

export const NVD_JSON = {
  vulnerabilities: [
    { cve: { id: 'CVE-2026-0001', published: '2026-10-20T10:00:00.000',
      metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] },
      descriptions: [{ lang: 'en', value: 'Old one <script>alert(1)</script>' }] } },
    { cve: { id: 'CVE-2026-0002', published: '2026-10-23T10:00:00.000',
      metrics: { cvssMetricV30: [{ cvssData: { baseScore: 9.1 } }] },
      descriptions: [{ lang: 'es', value: 'hola' }, { lang: 'en', value: 'New one' }] } },
  ],
};

// Google News RSS, trimmed (note: items are NOT in date order).
export const GOOGLE_NEWS_RSS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>"brussels when:1d" - Google News</title>
<item><title>Brussels Shopkeepers Board Up Stores as Europe Braces for Protests - Kurdistan24</title><link>https://news.google.com/rss/articles/CBMirwFB?oc=5</link><guid isPermaLink="false">CBMirwFB</guid><pubDate>Sat, 24 Oct 2026 11:43:00 GMT</pubDate><description>&lt;a href="x"&gt;y&lt;/a&gt;</description><source url="https://www.kurdistan24.net">Kurdistan24</source></item>
<item><title>Bergs leads Belgian charge, Griekspoor wins in Brussels &amp; more - ATP Tour</title><link>https://news.google.com/rss/articles/CBMi0AFB?oc=5</link><guid isPermaLink="false">CBMi0AFB</guid><pubDate>Sat, 24 Oct 2026 12:08:25 GMT</pubDate><description>z</description><source url="https://www.atptour.com">ATP Tour</source></item>
<item><title>evil &lt;script&gt; - Evil</title><link>javascript:alert(1)</link><guid isPermaLink="false">e</guid><pubDate>Sat, 24 Oct 2026 13:00:00 GMT</pubDate><description>z</description><source url="https://evil.example">Evil</source></item>
</channel></rss>`;

export const USGS_JSON = {
  type: 'FeatureCollection',
  features: [
    { properties: { mag: 4.7, place: '72 km S of Basco, Philippines', time: 1792842488678, url: 'https://earthquake.usgs.gov/a' }, geometry: { coordinates: [121.9, 19.8, 35.2] } },
    { properties: { mag: 2.6, place: '10 km N of Vrancea, Romania', time: 1792850000000, url: 'https://earthquake.usgs.gov/b' }, geometry: { coordinates: [26.6, 45.8, 120] } },
  ],
};

export const IODA_JSON = {
  type: 'outages.summary', error: null,
  data: [
    { scores: { 'gtr.sarima': 863484.1, overall: 863484.1 }, event_cnt: 1, entity: { code: 'LT', name: 'Lithuania' } },
    { scores: { 'gtr.sarima': 5150.6, 'bgp.median': 5013.2, overall: 25821093.2 }, event_cnt: 2, entity: { code: 'NF', name: 'Norfolk Island' } },
  ],
};

export const AIR_JSON = {
  current: {
    european_aqi: 34, pm2_5: 8.2, pm10: 14.9, ozone: 61, nitrogen_dioxide: 12.3,
    alder_pollen: 0, birch_pollen: 0.4, grass_pollen: 12.5, mugwort_pollen: 0, olive_pollen: 0, ragweed_pollen: 60.2,
  },
};

export const ASTRO_JSON = {
  utc_offset_seconds: 10800, // Bucharest summer time, UTC+3
  daily: { sunrise: ['2026-10-24T07:54'], sunset: ['2026-10-24T18:19'], daylight_duration: [37500], uv_index_max: [2.35] },
};

export const RADAR_JSON = {
  success: true,
  result: { top_0: [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: '4.21' },
    { originCountryAlpha2: 'CN', originCountryName: 'China', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: '2.5' },
  ] },
};
