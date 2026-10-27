// DOM helpers shared by all panels. Every panel has the same shape in index.html:
//   <section id="..."><h2>..</h2><div class="body"></div><div class="status"></div></section>

// Escape text from APIs before putting it in HTML (prevents HTML/script injection).
export function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Date -> "5m ago" / "3h ago"
export function ago(date, now) {
  const minutes = Math.max(0, Math.round((now - date) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

// Date -> "08:18", the time on this device (freshness lines)
export function hhmm(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

function panel(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Panel #${id} missing from index.html`);
  return el;
}

// Header status, from what the panels show right now (never invented): each panel is 'ok' (loaded),
// 'bad' (its last refresh failed) or 'wait' (still loading for the first time).
export function systemsLine(panels) {
  const bad = panels.filter((p) => p.state === 'bad').map((p) => p.name);
  const live = panels.filter((p) => p.state === 'ok').length;
  if (bad.length) {
    const names = bad.length <= 2 ? bad.join(' and ') : `${bad.slice(0, 2).join(', ')} and ${bad.length - 2} more`;
    return { text: `${names} need${bad.length === 1 ? 's' : ''} attention`, warm: true };
  }
  if (live < panels.length) return { text: `Connecting · ${live} of ${panels.length} panels live`, warm: false };
  return { text: `All ${panels.length} panels live`, warm: false };
}

// Segmented indicator next to the status line: one segment per panel, amber when it failed, dim while loading.
export function healthSegments(states) {
  return states.map((state) => `<i class="${state}"></i>`).join('');
}

function panelState(section) {
  if (section.classList.contains('error')) return 'bad';
  return section.dataset.updated ? 'ok' : 'wait';
}

let lastWarm = null;
function updateSystems() {
  const out = document.getElementById('systems');
  if (!out) return;
  const panels = [...document.querySelectorAll('main > section')].map((s) => ({ name: s.querySelector('h2').textContent.trim(), state: panelState(s) }));
  const line = systemsLine(panels);
  out.textContent = line.text;
  out.classList.toggle('warm', line.warm); // Reactor Amber: MIAP needs you
  if (lastWarm !== null && line.warm !== lastWarm) {
    out.classList.remove('ping'); // the dot pings once when the state changes, never constantly
    void out.offsetWidth; // restart the animation
    out.classList.add('ping');
  }
  lastWarm = line.warm;
  document.getElementById('health').innerHTML = healthSegments(panels.map((p) => p.state));
}

// Expandable cards: the details sit in a .more block that opens with a smooth height change.
// The open state lives on the <section> (data-open), so it survives the panel's next refresh.
const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5"/></svg>';
export function expander(innerHtml, label) {
  return `<div class="more"><div>${innerHtml}</div></div>
    <button type="button" class="expand" aria-expanded="false"><span class="closed">${label}</span><span class="opened">Show less</span>${CHEVRON}</button>`;
}

function syncExpanders(section) {
  for (const b of section.querySelectorAll('.expand')) b.setAttribute('aria-expanded', String(section.hasAttribute('data-open')));
}

export function toggleExpand(button) {
  const section = button.closest('section');
  section.toggleAttribute('data-open');
  syncExpanders(section);
}

// Freshness: a card shows no time while its data is current, like Apple's widgets. The line appears
// once the data is older than twice its refresh interval (at least 15 min), e.g. after the phone slept,
// so old data never passes for live data.
const MIN_STALE_MS = 15 * 60 * 1000;
export function freshness(updatedMs, everyMs, nowMs) {
  if (nowMs - updatedMs <= Math.max(2 * everyMs, MIN_STALE_MS)) return '';
  return `Last updated ${ago(updatedMs, nowMs)}`;
}

function markFreshness(now = Date.now()) {
  for (const el of document.querySelectorAll('main > section[data-updated]:not(.error)')) {
    const line = freshness(Number(el.dataset.updated), Number(el.dataset.every ?? 0), now);
    el.classList.toggle('stale', Boolean(line));
    el.querySelector('.status').textContent = line;
  }
}

// Re-checked every minute and when the page comes back to the screen.
export function watchFreshness() {
  setInterval(markFreshness, 60 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && markFreshness());
}

export function showBody(id, html) {
  const el = panel(id);
  el.classList.remove('error', 'stale');
  el.querySelector('.body').innerHTML = html;
  el.dataset.updated = String(Date.now());
  el.querySelector('.status').textContent = '';
  syncExpanders(el);
  updateSystems();
}

export function showError(id, err) {
  const el = panel(id);
  el.classList.add('error');
  el.querySelector('.body').innerHTML = `<p class="err">ERROR: ${esc(err.message)}</p>`;
  el.querySelector('.status').textContent = `Couldn't refresh at ${hhmm(new Date())}. Trying again at the next refresh.`;
  updateSystems();
  console.error(`[${id}]`, err);
}

// Run `task` now and then every `everyMs`. Errors are shown in the panel, never swallowed.
export function runPanel(id, task, everyMs) {
  panel(id).dataset.every = String(everyMs);
  const tick = async () => {
    try {
      await task();
    } catch (err) {
      showError(id, err);
    }
  };
  tick();
  setInterval(tick, everyMs);
}
