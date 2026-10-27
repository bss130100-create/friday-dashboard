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
  return section.querySelector('.status').textContent ? 'ok' : 'wait';
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

export function showBody(id, html) {
  const el = panel(id);
  el.classList.remove('error');
  el.querySelector('.body').innerHTML = html;
  el.querySelector('.status').textContent = `updated ${new Date().toISOString().slice(11, 19)}Z`;
  syncExpanders(el);
  updateSystems();
}

export function showError(id, err) {
  const el = panel(id);
  el.classList.add('error');
  el.querySelector('.body').innerHTML = `<p class="err">ERROR: ${esc(err.message)}</p>`;
  el.querySelector('.status').textContent = `failed ${new Date().toISOString().slice(11, 19)}Z, retries on next refresh`;
  updateSystems();
  console.error(`[${id}]`, err);
}

// Run `task` now and then every `everyMs`. Errors are shown in the panel, never swallowed.
export function runPanel(id, task, everyMs) {
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
