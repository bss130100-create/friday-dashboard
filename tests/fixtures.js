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

// Bing News RSS, trimmed (note: items are NOT in date order).
export const BING_NEWS_RSS = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0" xmlns:News="https://www.bing.com/news/search?q=brussels&amp;format=rss"><channel><title>brussels - BingNews</title>
<item><title>Brussels Shopkeepers Board Up Stores as Europe Braces for Protests</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=abc&amp;url=https%3a%2f%2fwww.kurdistan24.net%2fen%2fstory%2f1&amp;c=1&amp;mkt=en-us</link><description>x</description><pubDate>Sat, 24 Oct 2026 11:43:00 GMT</pubDate><News:Source>Kurdistan24</News:Source></item>
<item><title>Griekspoor wins in Brussels &amp; more</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=def&amp;url=https%3a%2f%2fwww.atptour.com%2fen%2fnews%2f2&amp;c=2&amp;mkt=en-us</link><description>z</description><pubDate>Sat, 24 Oct 2026 12:08:25 GMT</pubDate><News:Source>ATP Tour</News:Source></item>
<item><title>Last week's news</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fold.example%2fx</link><description>z</description><pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate><News:Source>Old</News:Source></item>
<item><title>evil</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=javascript%3aalert(1)</link><description>z</description><pubDate>Sat, 24 Oct 2026 13:00:00 GMT</pubDate><News:Source>Evil</News:Source></item>
</channel></rss>`;

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

// OpenHolidays, 2026-10-25, trimmed (Belgium).
const oh = (startDate, endDate, name, groups) => ({ startDate, endDate, name: [{ language: 'EN', text: name }], ...(groups && { groups: groups.map((code) => ({ code })) }) });
export const PUBLIC_HOLIDAYS_JSON = [
  oh('2026-11-01', '2026-11-01', 'All Saints Day'),
  oh('2026-11-11', '2026-11-11', 'Armistice Day'),
  oh('2026-12-25', '2026-12-25', 'Christmas Day'),
  oh('2027-01-01', '2027-01-01', "New Year's Day"),
  oh('2027-03-28', '2027-03-28', 'Easter'),
  oh('2027-03-29', '2027-03-29', 'Easter Monday'),
  oh('2027-05-06', '2027-05-06', 'Ascension Day'),
];
export const SCHOOL_HOLIDAYS_JSON = [
  oh('2026-10-19', '2026-11-01', 'All Saints Holidays', ['BE-FR']),
  oh('2026-11-02', '2026-11-08', 'All Saints Holidays', ['BE-NL']),
  oh('2026-12-21', '2027-01-03', 'Winter Holidays', ['BE-FR']),
];

// Energy-Charts /signal, 2026-10-25 (Belgium, a sunny Sunday): forecast renewable share per hour (%),
// the first 3 hours of the day plus the sunny early afternoon.
export const SIGNAL_JSON = {
  unix_seconds: [1792879200, 1792882800, 1792886400, 1792922400, 1792926000, 1792929600],
  share: [60.8, 61.6, 63.6, 104.1, 99.8, 95.1],
  signal: [2, 2, 2, 2, 2, 2],
};
