// News panel: latest English-language articles about a place you type, from the GDELT
// project (monitors news sites worldwide every 15 min, free, no key, max 1 request / 5 s).
import { fetchText } from './http.js';
import { esc } from './ui.js';

export function newsUrl(place) {
  const clean = place.trim();
  if (clean.length < 3) throw new Error('Type a place with at least 3 letters.');
  const params = new URLSearchParams({
    query: `"${clean.replaceAll('"', '')}" sourcelang:english`,
    mode: 'artlist',
    format: 'json',
    sort: 'datedesc',
    timespan: '24h',
    maxrecords: '15',
  });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
}

// GDELT answers some errors with HTTP 200 + a plain-text message, so parse defensively.
export function parseNews(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GDELT: ${text.trim().slice(0, 200)}`);
  }
  return (json.articles ?? [])
    .filter((a) => /^https?:\/\//.test(a.url)) // only real web links, never "javascript:" etc.
    .map((a) => ({
    title: a.title,
    url: a.url,
    domain: a.domain,
    seen: parseGdeltDate(a.seendate),
  }));
}

// "20261024T121500Z" -> Date
export function parseGdeltDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) throw new Error(`Unexpected GDELT date "${s}"`);
  return new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]));
}

export function ago(date, now) {
  const minutes = Math.round((now - date) / 60000);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export async function loadNews(place) {
  return parseNews(await fetchText(newsUrl(place)));
}

export function renderNews(place, articles, now) {
  if (articles.length === 0) return `<p class="dim">No English articles about "${esc(place)}" in the last 24 h.</p>`;
  return `<ul class="list">${articles.map((a) => `
    <li><span class="dim">${ago(a.seen, now)} · ${esc(a.domain)}</span><br>
      <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></li>`).join('')}
  </ul>`;
}
