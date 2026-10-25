import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brusselsToday, addDays, daysBetween, holidaysUrl, parseHolidays, bridge, schoolStatus, renderDaysOff } from '../js/daysoff.js';
import { PUBLIC_HOLIDAYS_JSON, SCHOOL_HOLIDAYS_JSON } from './fixtures.js';

test('dates: Brussels today (also across midnight UTC), adding days, counting days', () => {
  assert.equal(brusselsToday(new Date('2026-10-25T11:00:00Z')), '2026-10-25');
  assert.equal(brusselsToday(new Date('2026-10-25T23:30:00Z')), '2026-10-26'); // 00:30 in Brussels
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-25', '2026-11-01'), 7);
  const url = new URL(holidaysUrl('PublicHolidays', '2026-10-25'));
  assert.equal(url.pathname, '/PublicHolidays');
  assert.equal(url.searchParams.get('validTo'), '2027-10-25');
});

test('bridge days for a Monday-to-Friday week', () => {
  assert.equal(bridge('2027-03-29').text, 'long weekend, Sat–Mon'); // Easter Monday
  assert.deepEqual(bridge('2027-05-06'), { long: true, leave: 1, text: 'take Fri 7 May off: 4 days, Thu–Sun' }); // Ascension
  assert.equal(bridge('2026-12-25').text, 'long weekend, Fri–Sun');
  assert.equal(bridge('2026-11-11').long, false); // Wednesday
  assert.match(bridge('2026-11-01').text, /replacement day/); // Sunday
  assert.match(bridge('2027-01-12').text, /take Mon 11 Jan off/); // a Tuesday
});

test('school holidays: running now, next one, nothing published', () => {
  const school = parseHolidays(SCHOOL_HOLIDAYS_JSON);
  const [fr, nl] = schoolStatus(school, '2026-10-25');
  assert.equal(fr.text, 'All Saints Holidays now, until Sun 1 Nov');
  assert.equal(nl.text, 'All Saints Holidays: Mon 2 Nov – Sun 8 Nov (in 8 days)');
  assert.equal(schoolStatus(school, '2027-01-04')[0].text, 'no dates published yet');
});

test('panel: countdown, next long weekend, Easter Sunday left out', () => {
  const html = renderDaysOff({ today: '2026-10-25', publicDays: parseHolidays(PUBLIC_HOLIDAYS_JSON), school: parseHolidays(SCHOOL_HOLIDAYS_JSON) });
  assert.match(html, /<div class="big">7<span class="unit"> days<\/span><\/div>\s*<div class="dim">to All Saints Day, Sun 1 Nov/);
  assert.match(html, /Next long weekend: <strong>Christmas Day<\/strong>, Fri 25 Dec \(in 61 days\)\.<\/p>/);
  assert.doesNotMatch(html, />Easter</);
  assert.match(html, /Easter Monday/);
  assert.match(html, /NL schools/);
});

test('fails loudly on a bad answer or an empty year', () => {
  assert.throws(() => parseHolidays({ error: 'x' }), /expected a list/);
  assert.throws(() => renderDaysOff({ today: '2028-01-01', publicDays: parseHolidays(PUBLIC_HOLIDAYS_JSON), school: [] }), /no public holidays/);
});
