import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsUrl, parseRss, decodeXml, renderNews, articleUrl } from '../js/news.js';
import { ago } from '../js/ui.js';
import { BING_NEWS_RSS } from './fixtures.js';

const NOW = new Date('2026-10-24T14:00:00Z');

test('newsUrl asks our own Worker, with the trimmed place', () => {
  assert.equal(newsUrl('  New York '), '/news?q=New+York');
});

test('newsUrl rejects a 1-letter place', () => {
  assert.throws(() => newsUrl('B'), /at least 2/);
});

test('parseRss: last 24 h only, newest first, entities decoded, real https links only', () => {
  const articles = parseRss(BING_NEWS_RSS, NOW);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, 'Griekspoor wins in Brussels & more');
  assert.equal(articles[0].source, 'ATP Tour');
  assert.equal(articles[0].url, 'https://www.atptour.com/en/news/2');
  assert.equal(articles[0].published.toISOString(), '2026-10-24T12:08:25.000Z');
  assert.equal(articles[1].source, 'Kurdistan24');
});

test('articleUrl unwraps the Bing click-tracking link', () => {
  assert.equal(articleUrl('http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3a%2f%2fa.example%2fx'), 'https://a.example/x');
});

test('parseRss rejects a non-RSS answer (e.g. an HTML error page)', () => {
  assert.throws(() => parseRss('<html>Too many requests</html>', NOW), /Not an RSS feed/);
});

test('an empty feed means no articles, not an error', () => {
  assert.deepEqual(parseRss('<rss><channel></channel></rss>', NOW), []);
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

test('renderNews: 5 newest headlines, up to 7 more behind one button', () => {
  const a = (i) => ({ title: `T${i}`, url: `https://a.example/${i}`, source: 'S', published: NOW });
  const html = renderNews('x', Array.from({ length: 14 }, (_, i) => a(i)), NOW);
  const [shown, more] = html.split('<div class="more">');
  assert.equal((shown.match(/<li>/g) ?? []).length, 5);
  assert.equal((more.match(/<li>/g) ?? []).length, 7);
  assert.match(more, /<span class="closed">Show 7 more<\/span>/);
  assert.doesNotMatch(renderNews('x', [a(1)], NOW), /class="more"/);
});

test('renderNews escapes titles', () => {
  const html = renderNews('x', [{ title: '<b>hi</b>', url: 'https://a.example', source: 'S', published: new Date() }], new Date());
  assert.ok(!html.includes('<b>'));
});
