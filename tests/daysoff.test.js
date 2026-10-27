import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brusselsToday, addDays, daysBetween, holidaysUrl, parseHolidays, bridge, renderDaysOff, holidayTimeline, renderHolidays } from '../js/daysoff.js';
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

const DATA = { today: '2026-10-25', publicDays: parseHolidays(PUBLIC_HOLIDAYS_JSON), school: parseHolidays(SCHOOL_HOLIDAYS_JSON) };

test('days off card: countdown, what that day means, next long weekend', () => {
  const html = renderDaysOff(DATA);
  assert.match(html, /<div class="count"><span class="big">7<\/span><span class="unit">days<\/span><\/div>\s*<p class="lead">to <strong>All Saints Day<\/strong> · Sun 1 Nov<\/p>/);
  assert.match(html, /replacement day/); // 1 Nov is a Sunday
  assert.match(html, /Next long weekend: <strong>Christmas Day<\/strong>, Fri 25 Dec \(in 61 days\)\.<\/p>/);
  assert.match(renderDaysOff({ ...DATA, today: '2026-11-01' }), /<span class="big">Today<\/span><\/div>\s*<p class="lead"><strong>All Saints Day/);
  assert.match(renderDaysOff({ ...DATA, today: '2026-10-31' }), /<span class="big">1<\/span><span class="unit">day<\/span>/);
  assert.match(renderDaysOff({ ...DATA, today: '2026-12-01' }), /to <strong>Christmas Day[\s\S]*long weekend, Fri–Sun/);
  assert.doesNotMatch(renderDaysOff({ ...DATA, today: '2026-12-01' }), /Next long weekend/); // the next day off IS the long weekend
});

test('holiday timeline: public and school holidays in date order, running school holidays marked now', () => {
  const items = holidayTimeline(DATA);
  assert.deepEqual(items.slice(0, 4).map((h) => [h.start, h.name, h.note, h.kind, h.when]), [
    ['2026-10-19', 'All Saints Holidays', 'FR schools · until Sun 1 Nov', 'school', 'now'],
    ['2026-11-01', 'All Saints Day', 'weekend: you get a replacement day (your employer sets it)', 'day', 'in 7 days'],
    ['2026-11-02', 'All Saints Holidays', 'NL schools · until Sun 8 Nov', 'school', 'in 8 days'],
    ['2026-11-11', 'Armistice Day', 'midweek day off', 'day', 'in 17 days'],
  ]);
  assert.ok(!items.some((h) => h.name === 'Easter'));
  assert.equal(items.find((h) => h.name === 'Easter Monday').kind, 'long');
  const both = parseHolidays([...SCHOOL_HOLIDAYS_JSON, { ...SCHOOL_HOLIDAYS_JSON[2], groups: [{ code: 'BE-NL' }] }]);
  assert.equal(holidayTimeline({ ...DATA, school: both }).find((h) => h.name === 'Winter Holidays').note, 'FR + NL schools · until Sun 3 Jan');
  const german = parseHolidays([{ ...SCHOOL_HOLIDAYS_JSON[2], groups: [{ code: 'BE-DE' }] }]);
  assert.ok(!holidayTimeline({ ...DATA, school: german }).some((h) => h.name === 'Winter Holidays'));
});

test('holidays card: first 4 on the timeline, the rest behind "Show all"', () => {
  const html = renderHolidays(DATA);
  const [shown, hidden] = html.split('<div class="more">');
  assert.equal((shown.match(/<li /g) ?? []).length, 4);
  assert.match(shown, /<li class="school now"><span class="when">Mon 19 Oct<\/span>/);
  assert.match(hidden, /Easter Monday/);
  assert.match(html, /<span class="closed">Show all 9<\/span>/);
  assert.doesNotMatch(renderHolidays({ ...DATA, today: '2027-04-01' }), /class="more"/); // only Ascension left
});

test('fails loudly on a bad answer or an empty year', () => {
  assert.throws(() => parseHolidays({ error: 'x' }), /expected a list/);
  assert.throws(() => renderDaysOff({ today: '2028-01-01', publicDays: parseHolidays(PUBLIC_HOLIDAYS_JSON), school: [] }), /no public holidays/);
  assert.throws(() => renderHolidays({ today: '2028-01-01', publicDays: parseHolidays(PUBLIC_HOLIDAYS_JSON), school: [] }), /no holidays/);
});
