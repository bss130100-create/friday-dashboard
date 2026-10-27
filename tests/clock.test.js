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

test('renderClock: compact local time, then UTC, date and week on one line', () => {
  const html = renderClock(new Date('2026-10-24T14:00:05Z'));
  assert.match(html, /<div class="time">\d\d:\d\d<span class="sec">:05<\/span><\/div>/);
  assert.match(html, /<span class="mono">UTC 14:00:05<\/span> · Sat 24 Oct 2026 · Week 43<\/p>/);
  assert.doesNotMatch(html, /GPS|UNIX|TOW|<table/);
});
