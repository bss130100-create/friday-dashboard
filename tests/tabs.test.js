import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS, tabFromHash } from '../js/tabs.js';
import { healthSegments, systemsLine, expander } from '../js/ui.js';

test('tabFromHash: known tab, otherwise the first one', () => {
  assert.equal(tabFromHash('#commute'), 'commute');
  assert.equal(tabFromHash('#world'), 'world');
  assert.equal(tabFromHash('#global'), 'time'); // old tab, merged into World
  assert.equal(tabFromHash(''), 'time');
  assert.equal(tabFromHash('#nope'), 'time');
});

test('index.html: every panel sits in a tab, and every tab has a link and at least one panel', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sections = [...html.matchAll(/<section([^>]*)>/g)].map((m) => m[1]);
  assert.ok(sections.length >= 14);
  for (const attrs of sections) assert.match(attrs, new RegExp(`data-tab="(${TABS.join('|')})"`), attrs);
  for (const tab of TABS) {
    assert.ok(html.includes(`<a href="#${tab}">`), `link for ${tab}`);
    assert.ok(html.includes(`data-tab="${tab}"`), `panel in ${tab}`);
  }
});

test('index.html: tab bar has 5 tabs and the header shows the MIAP logo', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(TABS.length, 5);
  assert.match(html, /<div class="brand"><svg[^>]*>.*<\/svg><span>MIAP<\/span><\/div>/);
  assert.ok(html.includes('id="tab-title"'));
  assert.ok(!html.includes('Orbitron'), 'old HUD font is gone');
});

test('healthSegments: one segment per panel, failed and loading ones marked', () => {
  assert.equal(healthSegments(['ok', 'bad', 'wait']), '<i class="ok"></i><i class="bad"></i><i class="wait"></i>');
  assert.equal(healthSegments([]), '');
});

test('header status names what needs attention, from the panels themselves', () => {
  const p = (name, state = 'ok') => ({ name, state });
  assert.deepEqual(systemsLine([p('Weather'), p('Commute')]), { text: 'All 2 panels live', warm: false });
  assert.deepEqual(systemsLine([p('Weather'), p('Commute', 'wait')]), { text: 'Connecting · 1 of 2 panels live', warm: false });
  assert.deepEqual(systemsLine([p('Weather', 'bad'), p('Commute', 'wait')]), { text: 'Weather needs attention', warm: true });
  assert.equal(systemsLine([p('Weather', 'bad'), p('Air quality', 'bad')]).text, 'Weather and Air quality need attention');
  assert.equal(systemsLine(['A', 'B', 'C', 'D'].map((n) => p(n, 'bad'))).text, 'A, B and 2 more need attention');
});

test('expander: details hidden in .more, one button that says what opens', () => {
  const html = expander('<p>x</p>', 'Show all 9');
  assert.match(html, /^<div class="more"><div><p>x<\/p><\/div><\/div>/);
  assert.match(html, /<button type="button" class="expand" aria-expanded="false"><span class="closed">Show all 9<\/span><span class="opened">Show less<\/span>/);
});

test('Today: one prominent briefing card, then the small cards in the agreed order', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const today = [...html.matchAll(/<section data-tab="time" id="([^"]+)"( class="hero")?>/g)].map((m) => m[1] + (m[2] ? ' (hero)' : ''));
  assert.deepEqual(today, ['briefing (hero)', 'daysoff', 'holidays', 'commute-today', 'clock', 'power', 'astro']);
  assert.match(html, /<button type="button" id="brief-me"><span class="idle">Brief me<\/span>/);
});

test('style.css: motion only when it means something, Reduce Motion respected, dock clear of the content', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const infinite = css.split('\n').filter((line) => /infinite/.test(line));
  // the reactor moves only while MIAP thinks; the rest are the World maps' live markers
  for (const line of infinite) assert.match(line, /body\.thinking|\.worldmap/, line);
  assert.doesNotMatch(css, /\.systems::before \{[^}]*animation/); // status dot: no constant blink
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(css, /bottom: calc\(12px \+ env\(safe-area-inset-bottom\)\)/); // dock above the home indicator
  assert.match(css, /padding: max\(16px, env\(safe-area-inset-top\)\) 16px calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /scroll-padding-bottom: calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
});

test('index.html: footer comes after the panels, which fill at least one screen', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.ok(html.indexOf('<footer') > html.indexOf('</main>'));
  assert.match(css, /main \{ min-height: 100vh;/);
});
