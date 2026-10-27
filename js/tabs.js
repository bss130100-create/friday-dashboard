// Sub-menus: each panel's <section> says which tab it belongs to (data-tab in index.html).
// The open tab lives in the address (#commute ...), so a bookmark or a reload keeps it.
// Four tabs sit in the dock; System has no dock button: the arc reactor logo opens it.

export const TABS = ['time', 'commute', 'weather', 'intel', 'system'];
const TITLES = { time: 'Today', commute: 'Commute', weather: 'Weather', intel: 'Intel', system: 'System' };

export function tabFromHash(hash) {
  const tab = hash.replace(/^#/, '');
  return TABS.includes(tab) ? tab : TABS[0];
}

export function showTab(tab) {
  for (const s of document.querySelectorAll('main > section')) {
    if (!TABS.includes(s.dataset.tab)) throw new Error(`Panel #${s.id} has no valid data-tab`);
    s.hidden = s.dataset.tab !== tab;
  }
  for (const a of document.querySelectorAll('nav.tabs a, a.brand')) a.classList.toggle('on', a.hash === `#${tab}`);
  document.body.dataset.tab = tab; // Edit mode's "Reset to default order" resets this tab
  document.getElementById('tab-title').textContent = TITLES[tab]; // large title = tab name
}
