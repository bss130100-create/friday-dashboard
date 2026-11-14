import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANTS, dueOn, dueList, nextWatering, scheduleText, renderPlants } from '../js/plants.js';

const byName = (name) => PLANTS.find((p) => p.name === name);
const names = (list) => list.map((p) => p.name);

// 2026-11-14 is a Saturday, 2026-11-17 a Tuesday.
test('Tuesday: the three thirsty ones; Saturday: everyone, Echeveria every other week', () => {
  assert.deepEqual(names(dueList('2026-11-17')), ['Nerve plant', 'Cape heath', 'Lawson cypress']);
  assert.deepEqual(names(dueList('2026-11-14')), ['Nerve plant', 'Cape heath', 'Lawson cypress', 'Ficus Alii']);
  assert.deepEqual(names(dueList('2026-11-21')), ['Nerve plant', 'Cape heath', 'Lawson cypress', 'Ficus Alii', 'Echeveria']);
  assert.deepEqual(dueList('2026-11-18'), []); // Wednesday
});

test('every-other-week plants count from their start date only', () => {
  const echeveria = byName('Echeveria');
  assert.equal(dueOn(echeveria, '2026-11-07'), false); // a Saturday before the start
  assert.equal(dueOn(echeveria, '2026-11-28'), false);
  assert.equal(dueOn(echeveria, '2026-12-05'), true);
});

test('every from date is one of the plant\'s days (else it would never be due)', () => {
  for (const p of PLANTS.filter((x) => x.everyWeeks)) assert.ok(dueOn(p, p.from), p.name);
});

test('next watering day and schedule labels', () => {
  assert.deepEqual(nextWatering('2026-11-14').date, '2026-11-17');
  assert.deepEqual(nextWatering('2026-11-18').date, '2026-11-21');
  assert.throws(() => nextWatering('2026-11-14', []), /nothing to water/);
  assert.equal(scheduleText(byName('Nerve plant'), '2026-11-14'), 'Tue + Sat');
  assert.equal(scheduleText(byName('Echeveria'), '2026-11-14'), 'Every 2nd Sat · next 21 Nov');
  assert.equal(scheduleText(byName('Echeveria'), '2026-11-21'), 'Every 2nd Sat · today');
});

test('card: verdict first, due plants marked, outdoor warning shown', () => {
  const sat = renderPlants('2026-11-14');
  assert.match(sat, /<p class="verdict ok">Water today: Nerve plant, Cape heath, Lawson cypress, Ficus Alii<\/p>/);
  assert.match(sat, /Next: Tue 17 Nov · Nerve plant, Cape heath, Lawson cypress/);
  assert.equal((sat.match(/<li class="due">/g) ?? []).length, 4);
  assert.match(sat, /class="note warn">Outdoor conifer/);
  const wed = renderPlants('2026-11-18');
  assert.match(wed, /<p class="verdict">Nothing to water today<\/p>/);
  assert.match(wed, /Next: Sat 21 Nov · .*Echeveria/);
});
