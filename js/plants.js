// Plant watering memo: Mihai's plants and a fixed weekly rhythm (indoor, Brussels winter), so the card
// can say what to water today. Two watering days: Tuesday and Saturday.
// To add or change a plant, edit PLANTS (days: 0 = Sunday ... 6 = Saturday).
import { esc } from './ui.js';
import { addDays, daysBetween } from './daysoff.js';

const TUE = 2;
const SAT = 6;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// everyWeeks + from: only every Nth week (the label assumes N = 2), counted from that date (which must be one of the days).
export const PLANTS = [
  { name: 'Nerve plant', latin: 'Fittonia albivenis', days: [TUE, SAT], how: 'Keep lightly moist, never soggy. Collapses when thirsty, back up within hours of a drink.' },
  { name: 'Cape heath', latin: 'Erica gracilis', days: [TUE, SAT], how: 'Never let it dry out. Rainwater or filtered water (Brussels tap water is hard). Cool, bright spot.' },
  {
    name: 'Lawson cypress', latin: 'Chamaecyparis lawsoniana', days: [TUE, SAT], how: 'Keep the root ball moist.',
    warn: 'Outdoor conifer: indoors, the heating browns it. Move it to a balcony or garden.',
  },
  { name: 'Ficus Alii', latin: 'Ficus binnendijkii', days: [SAT], how: 'Only if the top 3 cm are dry, else skip a week. Empty the saucer.' },
  { name: 'Echeveria', latin: 'Echeveria', days: [SAT], everyWeeks: 2, from: '2026-11-21', how: 'Soak, drain, then let it dry out completely.' },
];

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const pretty = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));

// Is this plant watered on this date ('YYYY-MM-DD', Brussels)?
export function dueOn(plant, date) {
  if (!plant.days.includes(weekday(date))) return false;
  if (!plant.everyWeeks) return true;
  const n = daysBetween(plant.from, date);
  return n >= 0 && n % (7 * plant.everyWeeks) === 0;
}

export const dueList = (date, plants = PLANTS) => plants.filter((p) => dueOn(p, date));

// The first day after today with something to water.
export function nextWatering(today, plants = PLANTS) {
  for (let i = 1; i <= 28; i += 1) {
    const date = addDays(today, i);
    const due = dueList(date, plants);
    if (due.length) return { date, due };
  }
  throw new Error('Plant watering: nothing to water in the next 4 weeks');
}

export function scheduleText(plant, today) {
  const days = plant.days.map((d) => DAY_NAMES[d]).join(' + ');
  if (!plant.everyWeeks) return days;
  let next = today;
  while (!dueOn(plant, next)) next = addDays(next, 1); // ends within everyWeeks weeks
  return `Every 2nd ${days} · ${next === today ? 'today' : `next ${pretty(next).slice(4)}`}`;
}

const names = (plants) => plants.map((p) => p.name).join(', ');

export function renderPlants(today, plants = PLANTS) {
  const due = dueList(today, plants);
  const next = nextWatering(today, plants);
  const verdict = due.length
    ? `<p class="verdict ok">Water today: ${esc(names(due))}</p>`
    : '<p class="verdict">Nothing to water today</p>';
  const row = (p) => `<li${due.includes(p) ? ' class="due"' : ''}><span class="what"><strong>${esc(p.name)}</strong> <em>${esc(p.latin)}</em>
    <span class="note">${esc(p.how)}</span>${p.warn ? `<span class="note warn">${esc(p.warn)}</span>` : ''}</span><span class="days">${esc(scheduleText(p, today))}</span></li>`;
  return `${verdict}
    <p class="dim small">Next: ${pretty(next.date)} · ${esc(names(next.due))}</p>
    <ul class="plants">${plants.map(row).join('')}</ul>
    <p class="source">Feel the soil first: skip a plant that is still wet.</p>`;
}
