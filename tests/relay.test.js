import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upstreamRequest } from '../relay/worker.js';

const ENV = { RADAR_TOKEN: 'secret' };

test('relay maps /news?q= to an English Bing News RSS search', () => {
  const url = new URL(upstreamRequest('https://relay.example/news?q=Brussels', ENV).url);
  assert.equal(url.host, 'www.bing.com');
  assert.equal(url.searchParams.get('q'), 'Brussels');
  assert.equal(url.searchParams.get('format'), 'rss');
  assert.equal(url.searchParams.get('mkt'), 'en-US');
});

test('relay maps /attacks to Cloudflare Radar with the token', () => {
  const req = upstreamRequest('https://relay.example/attacks', ENV);
  assert.match(req.url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/radar\/attacks\/layer7\/top\/attacks\?/);
  assert.equal(req.headers.Authorization, 'Bearer secret');
});

test('relay explains a missing Radar token', () => {
  assert.throws(() => upstreamRequest('https://relay.example/attacks', {}), /RADAR_TOKEN/);
});

test('relay refuses any other path (it is not an open proxy)', () => {
  assert.throws(() => upstreamRequest('https://relay.example/https://evil.example', ENV), /unknown path/);
});

test('relay refuses empty or huge queries', () => {
  assert.throws(() => upstreamRequest('https://relay.example/news?q=', ENV), /2-80/);
  assert.throws(() => upstreamRequest(`https://relay.example/news?q=${'a'.repeat(81)}`, ENV), /2-80/);
});
