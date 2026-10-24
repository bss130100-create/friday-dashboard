import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS, tabFromHash } from '../js/tabs.js';

test('tabFromHash: known tab, otherwise the first one', () => {
  assert.equal(tabFromHash('#commute'), 'commute');
  assert.equal(tabFromHash('#global'), 'global');
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
