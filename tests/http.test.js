import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../js/http.js';

afterEach(() => { delete globalThis.fetch; });

test('non-2xx responses throw with status and host', async () => {
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  await assert.rejects(fetchJson('https://api.example.com/x'), /HTTP 500 from api\.example\.com/);
});

test('network failures throw a readable error', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchJson('https://api.example.com/x'), /Network error for api\.example\.com: Failed to fetch/);
});

test('2xx JSON is returned', async () => {
  globalThis.fetch = async () => Response.json({ ok: 1 });
  assert.deepEqual(await fetchJson('https://api.example.com/x'), { ok: 1 });
});

test('errors from our own Worker name the path, and hint at an expired login', async () => {
  globalThis.fetch = async () => new Response('nope', { status: 502 });
  await assert.rejects(fetchJson('/attacks'), /HTTP 502 from \/attacks/);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchJson('/attacks'), /Network error for \/attacks: Failed to fetch \(login expired\? reload the page\)/);
});
