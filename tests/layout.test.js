import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderIds, parseLayout, loadLayout, saveLayout } from '../js/layout.js';

const TODAY = ['briefing', 'commute-today', 'daysoff', 'topic', 'power'];

test('orderIds: nothing saved keeps the default order', () => {
  assert.deepEqual(orderIds(TODAY), TODAY);
  assert.deepEqual(orderIds(TODAY, []), TODAY);
});

test('orderIds: your saved order wins', () => {
  const mine = ['topic', 'briefing', 'power', 'daysoff', 'commute-today'];
  assert.deepEqual(orderIds(TODAY, mine), mine);
});

test('orderIds: a card added later lands below the card it follows by default', () => {
  // saved before "topic" existed; by default topic comes after daysoff
  assert.deepEqual(orderIds(TODAY, ['daysoff', 'briefing', 'commute-today', 'power']), ['daysoff', 'topic', 'briefing', 'commute-today', 'power']);
  // a new first card stays first
  assert.deepEqual(orderIds(['new', ...TODAY], ['power', ...TODAY.slice(0, 4)]), ['new', 'power', 'briefing', 'commute-today', 'daysoff', 'topic']);
});

test('orderIds: removed cards and duplicates are dropped', () => {
  assert.deepEqual(orderIds(TODAY, ['sats', 'power', 'power', 'briefing', 'commute-today', 'daysoff', 'topic']), ['power', 'briefing', 'commute-today', 'daysoff', 'topic']);
});

test('parseLayout: nothing saved is an empty layout; anything malformed is refused', () => {
  assert.deepEqual(parseLayout(null), {});
  assert.deepEqual(parseLayout({ time: ['a', 'b'] }), { time: ['a', 'b'] });
  assert.throws(() => parseLayout([]), /not an object/);
  assert.throws(() => parseLayout('x'), /not an object/);
  assert.throws(() => parseLayout({ time: 'briefing' }), /Panel order for time/);
  assert.throws(() => parseLayout({ time: [1] }), /Panel order for time/);
});

test('loadLayout / saveLayout talk to /settings/layout', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push([url, init.method ?? 'GET', init.body]);
    return Response.json(init.body ? JSON.parse(init.body) : null);
  };
  assert.deepEqual(await loadLayout(), {});
  assert.deepEqual(await saveLayout({ intel: ['history', 'news'] }), { intel: ['history', 'news'] });
  assert.deepEqual(calls, [['/settings/layout', 'GET', undefined], ['/settings/layout', 'PUT', '{"intel":["history","news"]}']]);
});
