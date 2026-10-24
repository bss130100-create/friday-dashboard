import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTopic, factOfDay, dayOfTopic, readWatched, toggleWatched, renderTopic } from '../js/topic.js';

const json = JSON.parse(readFileSync(new URL('../data/topic.json', import.meta.url)));

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}
afterEach(() => delete globalThis.localStorage);

test('the real data/topic.json is valid', () => {
  const t = parseTopic(json);
  assert.equal(t.topic, 'GPS and relativity');
  assert.equal(t.facts.length, 7);
});

test('bad topic files fail loudly', () => {
  assert.throws(() => parseTopic({ ...json, start: 'monday' }), /YYYY-MM-DD/);
  assert.throws(() => parseTopic({ ...json, facts: [] }), /facts/);
  assert.throws(() => parseTopic({ ...json, videos: [{ title: 'x', url: 'http://insecure' }] }), /https/);
});

test('fact rotates once a day and wraps around', () => {
  const t = parseTopic(json);
  assert.equal(dayOfTopic(t.start, new Date('2026-10-24T08:00:00Z')), 1);
  assert.equal(factOfDay(t, new Date('2026-10-24T23:00:00Z')), t.facts[0]);
  assert.equal(factOfDay(t, new Date('2026-10-25T06:00:00Z')), t.facts[1]);
  assert.equal(factOfDay(t, new Date('2026-10-31T06:00:00Z')), t.facts[0]); // day 8 -> wraps
});

test('watched videos are saved per topic and counted', () => {
  globalThis.localStorage = fakeStorage();
  const t = parseTopic(json);
  toggleWatched(t.topic, t.videos[0].url);
  toggleWatched(t.topic, t.videos[2].url);
  toggleWatched(t.topic, t.videos[2].url); // un-tick
  const watched = readWatched(t.topic);
  assert.deepEqual([...watched], [t.videos[0].url]);
  assert.equal(readWatched('another topic').size, 0);
  const html = renderTopic(t, watched, new Date('2026-10-26T09:00:00Z'));
  assert.match(html, /WATCH LIST · 1\/7/);
  assert.match(html, /day 3 of 7/);
  assert.equal((html.match(/ checked/g) ?? []).length, 1);
});
