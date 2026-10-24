import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, renderClock } from '../js/clock.js';

test('ISO week: today and the year edges', () => {
  assert.deepEqual(isoWeek(2026, 10, 24), { year: 2026, week: 43 });
  assert.deepEqual(isoWeek(2026, 1, 1), { year: 2026, week: 1 }); // a Thursday
  assert.deepEqual(isoWeek(2025, 12, 29), { year: 2026, week: 1 }); // Monday of that week
  assert.deepEqual(isoWeek(2027, 1, 1), { year: 2026, week: 53 }); // 2026 has 53 weeks
  assert.deepEqual(isoWeek(2027, 1, 4), { year: 2027, week: 1 });
});

test('renderClock shows UTC, date and week only', () => {
  const html = renderClock(new Date('2026-10-24T14:00:00Z'));
  assert.match(html, /<td>UTC<\/td><td>14:00:00<\/td>/);
  assert.match(html, /October 2026/);
  assert.match(html, /Week 43 of 2026/);
  assert.doesNotMatch(html, /GPS|UNIX|TOW/);
});
