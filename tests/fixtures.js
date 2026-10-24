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
  daily: { sunrise: ['2026-10-24T07:54'], sunset: ['2026-10-24T18:19'] },
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
