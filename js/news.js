// News panel: latest English Google News headlines about a place you type.
// Google News sends no CORS header, so we go through our own relay (relay/worker.js).
import { fetchText } from './http.js';
import { esc } from './ui.js';
import { RELAY_URL } from './config.js';

export function newsUrl(place, relayUrl = RELAY_URL) {
  if (!relayUrl) throw new Error('News relay not set up yet: put your Worker URL in js/config.js (see README).');
  const clean = place.trim();
  if (clean.length < 2) throw new Error('Type a place with at least 2 letters.');
  return `${relayUrl}/news?${new URLSearchParams({ q: clean })}`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// "&amp;" -> "&", "&#39;" -> "'"
export function decodeXml(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return String.fromCodePoint(n);
    }
    return ENTITIES[code] ?? match;
  });
}

function tag(item, name) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item);
  if (!m) throw new Error(`RSS item has no <${name}>`);
  return decodeXml(m[1]);
}

// Google News RSS text -> [{ title, url, source, published }], newest first.
// A small regex parser instead of DOMParser so the same code runs in tests (Node has no DOMParser).
export function parseRss(text) {
  if (!text.includes('<rss')) throw new Error(`Not an RSS feed: ${text.slice(0, 120)}`);
  const items = text.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item) => {
      const source = tag(item, 'source');
      const title = tag(item, 'title');
      return {
        title: title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title,
        url: tag(item, 'link'),
        source,
        published: new Date(tag(item, 'pubDate')),
      };
    })
    .filter((a) => a.url.startsWith('https://')) // only real web links, never "javascript:" etc.
    .sort((a, b) => b.published - a.published);
}

export function ago(date, now) {
  const minutes = Math.max(0, Math.round((now - date) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export async function loadNews(place) {
  return parseRss(await fetchText(newsUrl(place)));
}

export function renderNews(place, articles, now, max = 12) {
  if (articles.length === 0) return `<p class="dim">No English news about "${esc(place)}" in the last 24 h.</p>`;
  return `<ul class="list">${articles.slice(0, max).map((a) => `
    <li><span class="dim">${ago(a.published, now)} · ${esc(a.source)}</span><br>
      <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></li>`).join('')}
  </ul>`;
}
