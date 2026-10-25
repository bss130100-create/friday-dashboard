// Sub-menus: each panel's <section> says which tab it belongs to (data-tab in index.html).
// The open tab lives in the address (#commute ...), so a bookmark or a reload keeps it.

export const TABS = ['time', 'commute', 'weather', 'news', 'global', 'system'];

export function tabFromHash(hash) {
  const tab = hash.replace(/^#/, '');
  return TABS.includes(tab) ? tab : TABS[0];
}

export function showTab(tab) {
  for (const s of document.querySelectorAll('main > section')) {
    if (!TABS.includes(s.dataset.tab)) throw new Error(`Panel #${s.id} has no valid data-tab`);
    s.hidden = s.dataset.tab !== tab;
  }
  for (const a of document.querySelectorAll('nav.tabs a')) a.classList.toggle('on', a.hash === `#${tab}`);
}
