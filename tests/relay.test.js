import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upstreamUrl } from '../relay/worker.js';

test('relay maps /news?q= to a Google News search limited to the last day', () => {
  const url = new URL(upstreamUrl('https://relay.example/news?q=Brussels'));
  assert.equal(url.host, 'news.google.com');
  assert.equal(url.searchParams.get('q'), 'Brussels when:1d');
  assert.equal(url.searchParams.get('hl'), 'en-US');
});

test('relay refuses any other path (it is not an open proxy)', () => {
  assert.throws(() => upstreamUrl('https://relay.example/https://evil.example'), /unknown path/);
});

test('relay refuses empty or huge queries', () => {
  assert.throws(() => upstreamUrl('https://relay.example/news?q='), /2-80/);
  assert.throws(() => upstreamUrl(`https://relay.example/news?q=${'a'.repeat(81)}`), /2-80/);
});
