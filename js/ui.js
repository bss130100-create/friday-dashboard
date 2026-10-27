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

// Segmented indicator under the status line: one lit segment per panel, amber when that panel failed.
export function healthSegments(oks) {
  return oks.map((ok) => `<i class="${ok ? 'ok' : 'bad'}"></i>`).join('');
}

// Header readout: how many panels are currently healthy.
function updateSystems() {
  const out = document.getElementById('systems');
  if (!out) return;
  const all = document.querySelectorAll('main > section').length;
  const failed = document.querySelectorAll('main > section.error').length;
  out.textContent = failed ? `${failed} of ${all} panels need attention` : 'All systems normal';
  out.classList.toggle('warm', failed > 0); // Reactor Amber: MIAP needs you
  const health = document.getElementById('health');
  if (health) health.innerHTML = healthSegments([...document.querySelectorAll('main > section')].map((s) => !s.classList.contains('error')));
}

export function showBody(id, html) {
  const el = panel(id);
  el.classList.remove('error');
  el.querySelector('.body').innerHTML = html;
  el.querySelector('.status').textContent = `updated ${new Date().toISOString().slice(11, 19)}Z`;
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
