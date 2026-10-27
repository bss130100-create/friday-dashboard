// Edit mode: put the cards of the open tab in your own order, like Apple Health's "Edit".
// Tap Edit: every card folds to its title row with a grip on the right. Drag a grip (or focus it and
// press the up/down arrow keys), then tap Done. Each change is saved to MIAP's database at once.
import { TABS } from './tabs.js';
import { orderIds, loadLayout, saveLayout } from './layout.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';

// true when `b` comes after `a` in the page
const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const middle = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };

export function startArrange(main, onDone) {
  const sectionsOf = (tab) => [...main.querySelectorAll(`:scope > section[data-tab="${tab}"]`)];
  const defaults = Object.fromEntries(TABS.map((tab) => [tab, sectionsOf(tab).map((s) => s.id)]));
  const editButton = document.getElementById('edit-order');
  const msg = document.getElementById('order-msg');
  let layout = {};

  const report = (what, err) => { msg.textContent = err ? `Panel order not ${what}: ${err.message}` : ''; };
  const place = (ids) => ids.forEach((id) => main.append(document.getElementById(id)));

  // One save at a time, in order: each one carries the whole layout, so the last one wins.
  let saving = Promise.resolve();
  const save = () => {
    const snapshot = layout;
    saving = saving.then(() => saveLayout(snapshot)).then(() => report('saved', null), (err) => report('saved', err));
  };
  const remember = (tab) => {
    layout = { ...layout, [tab]: sectionsOf(tab).map((s) => s.id) };
    save();
  };

  loadLayout()
    .then((saved) => {
      layout = saved;
      for (const tab of TABS) place(orderIds(defaults[tab], layout[tab]));
    })
    .catch((err) => report('loaded', err));

  editButton.addEventListener('click', () => {
    const editing = document.body.classList.toggle('editing');
    editButton.textContent = editing ? 'Done' : 'Edit';
    editButton.setAttribute('aria-pressed', String(editing));
    if (!editing) onDone();
  });

  document.getElementById('reset-order').addEventListener('click', () => {
    const tab = document.body.dataset.tab;
    const { [tab]: _dropped, ...rest } = layout;
    layout = rest;
    place(defaults[tab]);
    save();
  });

  for (const section of main.querySelectorAll(':scope > section')) {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'grip';
    grip.innerHTML = GRIP;
    grip.setAttribute('aria-label', `Move ${section.querySelector('h2').textContent.trim()}`);
    grip.addEventListener('pointerdown', (event) => drag(section, grip, event));
    grip.addEventListener('keydown', (event) => nudge(section, grip, event));
    section.append(grip); // last child: the card label (h2) stays first
  }

  // The lifted row follows the finger; the other rows make way as it passes their middle.
  function drag(section, grip, start) {
    const tab = section.dataset.tab;
    const before = sectionsOf(tab).map((s) => s.id).join();
    const grab = start.clientY - section.getBoundingClientRect().top;
    let shift = 0;
    const stop = new AbortController();
    grip.setPointerCapture(start.pointerId);
    section.classList.add('lifted');

    grip.addEventListener('pointermove', (event) => {
      const y = event.clientY;
      const others = sectionsOf(tab).filter((s) => s !== section);
      const passedDown = others.filter((s) => follows(section, s) && middle(s) < y).pop();
      const passedUp = others.find((s) => !follows(section, s) && middle(s) > y);
      if (passedDown) passedDown.after(section);
      else if (passedUp) passedUp.before(section);
      const natural = section.getBoundingClientRect().top - shift; // where the row sits without the lift
      shift = y - grab - natural;
      section.style.transform = `translateY(${shift}px)`;
    }, { signal: stop.signal });

    const drop = () => {
      stop.abort();
      section.classList.remove('lifted');
      section.style.transform = '';
      if (sectionsOf(tab).map((s) => s.id).join() !== before) remember(tab);
    };
    grip.addEventListener('pointerup', drop, { signal: stop.signal });
    grip.addEventListener('pointercancel', drop, { signal: stop.signal });
  }

  // Keyboard: arrow up/down moves the card one place.
  function nudge(section, grip, event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const tab = section.dataset.tab;
    const rows = sectionsOf(tab);
    const i = rows.indexOf(section);
    if (event.key === 'ArrowUp' && i > 0) rows[i - 1].before(section);
    else if (event.key === 'ArrowDown' && i < rows.length - 1) rows[i + 1].after(section);
    else return;
    grip.focus(); // moving an element can drop its focus
    remember(tab);
  }
}
