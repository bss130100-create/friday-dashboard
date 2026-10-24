import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cveUrl, parseCves, renderCves } from '../js/cves.js';
import { NVD_JSON } from './fixtures.js';

test('cveUrl asks for CRITICAL CVEs of the last 7 days', () => {
  const url = decodeURIComponent(cveUrl(new Date('2026-10-24T14:00:00Z')));
  assert.match(url, /cvssV3Severity=CRITICAL/);
  assert.match(url, /pubStartDate=2026-10-17T14:00:00\.000/);
  assert.match(url, /pubEndDate=2026-10-24T14:00:00\.000/);
});

test('parseCves sorts newest first and reads v3.1 or v3.0 scores', () => {
  const cves = parseCves(NVD_JSON);
  assert.deepEqual(cves.map((c) => c.id), ['CVE-2026-0002', 'CVE-2026-0001']);
  assert.equal(cves[0].score, 9.1);
  assert.equal(cves[0].summary, 'New one');
  assert.equal(cves[1].score, 9.8);
});

test('parseCves throws on an unexpected response', () => {
  assert.throws(() => parseCves({ message: 'rate limited' }), /no vulnerabilities list/);
});

test('renderCves escapes HTML coming from the API', () => {
  const html = renderCves(parseCves(NVD_JSON));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});
