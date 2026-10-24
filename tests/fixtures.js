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

export const GDELT_TEXT = JSON.stringify({
  articles: [
    { url: 'https://www.rri.ro/en/x', title: 'The Week in Review', seendate: '20261024T121500Z', domain: 'rri.ro' },
    { url: 'javascript:alert(1)', title: 'evil', seendate: '20261024T121500Z', domain: 'evil.example' },
  ],
});
