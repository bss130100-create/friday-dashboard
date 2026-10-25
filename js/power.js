// Electricity panel: Belgian day-ahead market price and renewable share, hour by hour, from our
// Worker (/power, which relays Energy-Charts). Shows the price now and the cheapest 3-hour
// window ahead, for timing the washing machine, dishwasher or charging.
// Market price only: what Engie bills on top (fees, grid, taxes) is not included.
import { fetchJson } from './http.js';
import { esc } from './ui.js';
import { barChart } from './charts.js';

const HOUR = 3600;
export const WINDOW_HOURS = 3;

// Quarter-hour prices (EUR/MWh) and hourly renewable shares (%) -> one entry per hour from the
// current hour on: { t (unix seconds, start of the hour), price (c€/kWh), share (% or null) }.
export function parsePower(json, now) {
  const { price, renewables } = json ?? {};
  if (!Array.isArray(price?.price) || !Array.isArray(renewables?.share)) throw new Error('/power: unexpected answer');
  const hours = new Map();
  price.unix_seconds.forEach((s, i) => {
    if (price.price[i] === null) return; // not published yet
    const t = s - (s % HOUR);
    const h = hours.get(t) ?? { sum: 0, n: 0 };
    h.sum += price.price[i];
    h.n += 1;
    hours.set(t, h);
  });
  const shares = new Map(renewables.unix_seconds.map((s, i) => [s - (s % HOUR), renewables.share[i]]));
  const thisHour = Math.floor(now.getTime() / 1000 / HOUR) * HOUR;
  const out = [...hours]
    .filter(([t]) => t >= thisHour)
    .sort(([a], [b]) => a - b)
    .map(([t, h]) => ({ t, price: h.sum / h.n / 10, share: shares.get(t) ?? null })); // EUR/MWh -> c€/kWh
  if (!out.length) throw new Error('No electricity prices for the coming hours yet');
  return out;
}

// Cheapest run of `hours` consecutive hours (lowest average price), or null if there aren't enough.
export function cheapestWindow(list, hours = WINDOW_HOURS) {
  let best = null;
  for (let i = 0; i + hours <= list.length; i++) {
    const run = list.slice(i, i + hours);
    if (run[hours - 1].t - run[0].t !== (hours - 1) * HOUR) continue; // a gap in the data
    const avg = run.reduce((sum, h) => sum + h.price, 0) / hours;
    if (!best || avg < best.avg) best = { from: run[0].t, to: run[0].t + hours * HOUR, avg };
  }
  return best;
}

const clock = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).format(t * 1000);
const day = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short' }).format(t * 1000);
const cents = (v) => `${v.toFixed(1)} c€/kWh`;

export async function loadPower(now) {
  return parsePower(await fetchJson('/power'), now);
}

export function renderPower(list) {
  const nowH = list[0];
  const best = cheapestWindow(list);
  const dear = list.reduce((a, b) => (b.price > a.price ? b : a));
  const chart = barChart(
    list.filter((h) => h.share !== null).map((h) => ({ label: `${day(h.t)} ${clock(h.t)} · ${cents(h.price)}`, value: h.share })),
    { unit: '% renewable' },
  );
  return `
    <div class="gauge-row">
      <div class="big">${nowH.price.toFixed(1)}<span class="unit"> c€/kWh</span></div>
      <div class="dim">market price now${nowH.share === null ? '' : ` · ${Math.round(nowH.share)}% renewable`}</div>
    </div>
    <table>
      ${best ? `<tr><td class="nowrap">Cheapest ${WINDOW_HOURS} h</td><td class="nowrap">${esc(day(best.from))} ${clock(best.from)}–${clock(best.to)}</td><td class="nowrap">${cents(best.avg)}</td></tr>` : ''}
      <tr><td>Priciest</td><td class="nowrap">${esc(day(dear.t))} ${clock(dear.t)}</td><td class="hot nowrap">${cents(dear.price)}</td></tr>
    </table>
    <h3>RENEWABLE SHARE BY HOUR</h3>
    ${chart}
    <p class="dim small">Belgian day-ahead market, known until ${esc(day(list.at(-1).t))} ${clock(list.at(-1).t + HOUR)}. Your Engie bill adds fees, grid costs and taxes. Over 100% renewable = Belgium exports the surplus.</p>`;
}
