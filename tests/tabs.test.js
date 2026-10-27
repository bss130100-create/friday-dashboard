import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS, tabFromHash } from '../js/tabs.js';
import { healthSegments, systemsLine, expander } from '../js/ui.js';

test('tabFromHash: known tab, otherwise the first one', () => {
  assert.equal(tabFromHash('#commute'), 'commute');
  assert.equal(tabFromHash('#intel'), 'intel');
  assert.equal(tabFromHash('#system'), 'system');
  assert.equal(tabFromHash('#world'), 'time'); // old tab, renamed Intel
  assert.equal(tabFromHash(''), 'time');
  assert.equal(tabFromHash('#nope'), 'time');
});

test('index.html: every panel sits in a tab, and every tab has a link and at least one panel', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sections = [...html.matchAll(/<section([^>]*)>/g)].map((m) => m[1]);
  assert.ok(sections.length >= 14);
  for (const attrs of sections) assert.match(attrs, new RegExp(`data-tab="(${TABS.join('|')})"`), attrs);
  for (const tab of TABS) {
    assert.ok(html.includes(`href="#${tab}"`), `link for ${tab}`);
    assert.ok(html.includes(`data-tab="${tab}"`), `panel in ${tab}`);
  }
});

test('index.html: four tabs in the dock, System opens from the MIAP logo', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const dock = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>'));
  assert.deepEqual([...dock.matchAll(/<a href="#(\w+)">/g)].map((m) => m[1]), ['time', 'commute', 'weather', 'intel']);
  assert.match(html, /<a class="brand" href="#system" aria-label="System status and settings"><svg[^>]*>.*<\/svg><span>MIAP<\/span><\/a>/);
  assert.ok(html.includes('id="tab-title"'));
  assert.match(html, /<h1 id="tab-title">Today<\/h1><button type="button" id="edit-order" aria-pressed="false">Edit<\/button>/);
  assert.match(html, /<button type="button" id="reset-order">Reset to default order<\/button>/);
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

test('default card order on each tab (Mission control layout); Edit changes it per person', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const cards = (tab) => [...html.matchAll(new RegExp(`<section data-tab="${tab}" id="([^"]+)"( class="hero")?`, 'g'))].map((m) => m[1] + (m[2] ? ' (hero)' : ''));
  assert.deepEqual(cards('time'), ['briefing (hero)', 'commute-today', 'daysoff', 'topic', 'power', 'clock', 'astro']);
  assert.deepEqual(cards('weather'), ['atmosphere (hero)', 'wxmap', 'air']);
  assert.match(html, /<div class="segmented" role="group" aria-label="Map layer"><button type="button" data-layer="temp" aria-pressed="true">Temperature<\/button><button type="button" data-layer="wind" aria-pressed="false">Wind<\/button><button type="button" data-layer="rain" aria-pressed="false">Rain<\/button><\/div>/);
  assert.deepEqual(cards('commute'), ['routes (hero)', 'traffic', 'here']);
  assert.equal(cards('intel')[0], 'news (hero)');
  assert.deepEqual(cards('system'), ['usage (hero)', 'alerts', 'addresses']);
  assert.match(html, /<button type="button" id="brief-me"><span class="idle">Brief me<\/span>/);
});

test('no card id equals a tab name (the browser would scroll past the header to that card)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const tab of TABS) assert.ok(!ids.includes(tab), tab);
});

test('every tab opens with exactly one prominent (hero) card', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sections = [...html.matchAll(/<section data-tab="([a-z]+)" id="([^"]+)"( class="hero")?>/g)].map((m) => ({ tab: m[1], id: m[2], hero: Boolean(m[3]) }));
  for (const tab of TABS) {
    const mine = sections.filter((x) => x.tab === tab);
    assert.equal(mine.filter((x) => x.hero).length, 1, tab);
    assert.ok(mine[0].hero, `${tab}: hero first`);
  }
  assert.equal(sections.filter((x) => !/<h2><svg class="ico"/.test(html.slice(html.indexOf(`id="${x.id}"`), html.indexOf('</h2>', html.indexOf(`id="${x.id}"`))))).length, 0, 'every card label has an icon');
});

test('style.css: motion only when it means something, Reduce Motion respected, dock clear of the content', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const infinite = css.split('\n').filter((line) => /infinite/.test(line));
  // the reactor moves only while MIAP thinks; nothing else loops
  for (const line of infinite) assert.match(line, /body\.thinking/, line);
  assert.doesNotMatch(css, /\.systems::before \{[^}]*animation/); // status dot: no constant blink
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(css, /bottom: calc\(12px \+ env\(safe-area-inset-bottom\)\)/); // dock above the home indicator
  assert.match(css, /padding: max\(var\(--s4\), env\(safe-area-inset-top\)\) var\(--s4\) calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /scroll-padding-bottom: calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
});

test('style.css: maps keep Leaflet\'s layers inside them, so the dock is always drawn on top', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  // Leaflet's controls (zoom, OpenStreetMap credits) have z-index 1000, like the dock: without their own
  // stacking context they tie with it and, coming later in the page, draw over it.
  assert.match(css, /\.tmap \{ isolation: isolate;/);
  assert.match(css, /nav\.tabs \{\n  position: fixed;[^}]*z-index: 1000;/);
});

test('index.html: footer comes after the panels, which fill at least one screen', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.ok(html.indexOf('<footer') > html.indexOf('</main>'));
  assert.match(css, /main \{ min-height: 100vh;/);
});

test('logo: the scan ring is never rotated with transforms (Safari drew it off the reactor)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const logo = html.slice(html.indexOf('<a class="brand"'), html.indexOf('</svg>', html.indexOf('<a class="brand"')));
  assert.doesNotMatch(logo, /transform=/);
  assert.doesNotMatch(css, /\.brand \.scan \{[^}]*transform/);
  assert.match(css, /@keyframes scan \{ from \{ stroke-dashoffset/);
});

test('design tokens: style.css only uses names defined in tokens.css, no own colours, glows at most 3px', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('href="tokens.css"') < html.indexOf('href="style.css"'), 'tokens load first');
  const defined = new Set([...tokens.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((name) => !defined.has(name)), []);
  // hex colours live in tokens.css; style.css keeps only black (mask, map shadows) and white (map labels)
  assert.deepEqual([...new Set(css.match(/#[0-9a-fA-F]{3,6}\b/g))].filter((c) => !['#000', '#fff'].includes(c)), []);
  for (const line of css.split('\n').filter((l) => !/@keyframes ping/.test(l))) {
    for (const [, blur] of line.matchAll(/(?:drop-shadow\(|box-shadow: |, )0 0 (\d+)px/g)) assert.ok(Number(blur) <= 3, line);
  }
});
