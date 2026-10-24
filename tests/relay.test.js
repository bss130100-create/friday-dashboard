import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upstreamRequest } from '../relay/worker.js';

test('relay maps /news?q= to an English Bing News RSS search', () => {
  const url = new URL(upstreamRequest('https://relay.example/news?q=Brussels').url);
  assert.equal(url.host, 'www.bing.com');
  assert.equal(url.searchParams.get('q'), 'Brussels');
  assert.equal(url.searchParams.get('format'), 'rss');
  assert.equal(url.searchParams.get('mkt'), 'en-US');
  assert.equal(url.searchParams.get('qft'), 'interval="7"');
});

test('relay refuses any other path (it is not an open proxy)', () => {
  assert.throws(() => upstreamRequest('https://relay.example/https://evil.example'), /unknown path/);
});

test('relay refuses empty or huge queries', () => {
  assert.throws(() => upstreamRequest('https://relay.example/news?q='), /2-80/);
  assert.throws(() => upstreamRequest(`https://relay.example/news?q=${'a'.repeat(81)}`), /2-80/);
});
