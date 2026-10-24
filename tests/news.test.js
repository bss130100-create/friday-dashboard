import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsUrl, parseNews, parseGdeltDate, ago, renderNews } from '../js/news.js';
import { GDELT_TEXT } from './fixtures.js';

test('newsUrl quotes the place and restricts to English, last 24 h', () => {
  const url = new URL(newsUrl('  New York '));
  assert.equal(url.searchParams.get('query'), '"New York" sourcelang:english');
  assert.equal(url.searchParams.get('timespan'), '24h');
});

test('newsUrl rejects places shorter than 3 letters (GDELT would refuse them)', () => {
  assert.throws(() => newsUrl('NY'), /at least 3/);
});

test('parseNews keeps only http(s) links', () => {
  const articles = parseNews(GDELT_TEXT);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].domain, 'rri.ro');
});

test('parseNews turns GDELT plain-text errors into exceptions', () => {
  assert.throws(() => parseNews('Please limit requests to one every 5 seconds'), /GDELT: Please limit/);
});

test('empty result means no articles, not an error', () => {
  assert.deepEqual(parseNews('{}'), []);
  assert.match(renderNews('Bucharest', [], new Date()), /No English articles/);
});

test('GDELT dates and "ago" labels', () => {
  const d = parseGdeltDate('20261024T121500Z');
  assert.equal(d.toISOString(), '2026-10-24T12:15:00.000Z');
  assert.equal(ago(d, new Date('2026-10-24T12:45:00Z')), '30m ago');
  assert.equal(ago(d, new Date('2026-10-24T15:20:00Z')), '3h ago');
  assert.throws(() => parseGdeltDate('yesterday'), /Unexpected GDELT date/);
});
