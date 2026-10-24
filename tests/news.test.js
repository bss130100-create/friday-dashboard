import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsUrl, parseRss, decodeXml, renderNews } from '../js/news.js';
import { ago } from '../js/ui.js';
import { GOOGLE_NEWS_RSS } from './fixtures.js';

const RELAY = 'https://friday-relay.example.workers.dev';

test('newsUrl goes through the relay with the trimmed place', () => {
  assert.equal(newsUrl('  New York ', RELAY), `${RELAY}/news?q=New+York`);
});

test('newsUrl fails clearly when the relay is not configured', () => {
  assert.throws(() => newsUrl('Brussels', ''), /relay not set up/);
});

test('newsUrl rejects a 1-letter place', () => {
  assert.throws(() => newsUrl('B', RELAY), /at least 2/);
});

test('parseRss: newest first, source stripped from title, entities decoded, only https links', () => {
  const articles = parseRss(GOOGLE_NEWS_RSS);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, 'Bergs leads Belgian charge, Griekspoor wins in Brussels & more');
  assert.equal(articles[0].source, 'ATP Tour');
  assert.equal(articles[0].published.toISOString(), '2026-10-24T12:08:25.000Z');
  assert.equal(articles[1].source, 'Kurdistan24');
});

test('parseRss rejects a non-RSS answer (e.g. an HTML error page)', () => {
  assert.throws(() => parseRss('<html>Too many requests</html>'), /Not an RSS feed/);
});

test('an empty feed means no articles, not an error', () => {
  assert.deepEqual(parseRss('<rss><channel></channel></rss>'), []);
  assert.match(renderNews('Brussels', [], new Date()), /No English news/);
});

test('decodeXml handles named and numeric entities', () => {
  assert.equal(decodeXml('a &amp; b &#39;c&#x27; &lt;d&gt;'), "a & b 'c' <d>");
});

test('"ago" labels', () => {
  const d = new Date('2026-10-24T12:15:00Z');
  assert.equal(ago(d, new Date('2026-10-24T12:45:00Z')), '30m ago');
  assert.equal(ago(d, new Date('2026-10-24T15:20:00Z')), '3h ago');
});

test('renderNews escapes titles', () => {
  const html = renderNews('x', [{ title: '<b>hi</b>', url: 'https://a.example', source: 'S', published: new Date() }], new Date());
  assert.ok(!html.includes('<b>'));
});
