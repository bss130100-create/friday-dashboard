// CVE panel: newest CRITICAL vulnerabilities (CVSS v3 >= 9.0) from the US NVD API (no key needed).
// Without a key NVD allows 5 requests / 30 s, we ask once every 30 min.
import { fetchJson } from './http.js';
import { esc } from './ui.js';

const LOOKBACK_DAYS = 7;

// NVD wants "2026-10-24T14:00:00.000" (UTC, no Z).
const nvdDate = (d) => d.toISOString().slice(0, 23);

export function cveUrl(now) {
  const start = new Date(now.getTime() - LOOKBACK_DAYS * 86400 * 1000);
  const params = new URLSearchParams({
    cvssV3Severity: 'CRITICAL',
    pubStartDate: nvdDate(start),
    pubEndDate: nvdDate(now),
    resultsPerPage: '200',
  });
  return `https://services.nvd.nist.gov/rest/json/cves/2.0?${params}`;
}

// NVD JSON -> [{ id, published, score, summary }], newest first.
export function parseCves(json) {
  if (!Array.isArray(json.vulnerabilities)) throw new Error('NVD response has no vulnerabilities list');
  return json.vulnerabilities
    .map(({ cve }) => ({
      id: cve.id,
      published: cve.published,
      score: cve.metrics?.cvssMetricV31?.[0]?.cvssData.baseScore ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData.baseScore,
      summary: cve.descriptions.find((d) => d.lang === 'en')?.value ?? '(no English description)',
    }))
    .sort((a, b) => b.published.localeCompare(a.published));
}

export async function loadCves(now) {
  return parseCves(await fetchJson(cveUrl(now)));
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function renderCves(cves, max = 8) {
  if (cves.length === 0) return `<p class="dim">No critical CVEs published in the last ${LOOKBACK_DAYS} days.</p>`;
  return `
    <p class="dim">${cves.length} critical CVEs in the last ${LOOKBACK_DAYS} days. Newest:</p>
    <ul class="list">${cves.slice(0, max).map((c) => `
      <li><a href="https://nvd.nist.gov/vuln/detail/${encodeURIComponent(c.id)}" target="_blank" rel="noopener">${esc(c.id)}</a>
        <span class="crit">[${c.score ?? '?'}]</span> <span class="dim">${esc(c.published.slice(0, 10))}</span><br>
        ${esc(truncate(c.summary, 160))}</li>`).join('')}
    </ul>`;
}
