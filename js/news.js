// News panel: latest English Bing News headlines about a place you type (last 24 h).
// Bing sends no CORS header, so we go through our own Worker (relay/worker.js), which also serves this page.
import { fetchText } from './http.js';
import { esc, ago } from './ui.js';

export function newsUrl(place) {
  const clean = place.trim();
  if (clean.length < 2) throw new Error('Type a place with at least 2 letters.');
  return `/news?${new URLSearchParams({ q: clean })}`;
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

// Bing wraps each article link in a click-tracking URL; the real address is its "url" parameter.
export function articleUrl(bingLink) {
  const link = new URL(bingLink);
  return link.searchParams.get('url') ?? bingLink;
}

const DAY_MS = 86400 * 1000;

// Bing News RSS text -> [{ title, url, source, published }] from the last 24 h, newest first.
// A small regex parser instead of DOMParser so the same code runs in tests (Node has no DOMParser).
export function parseRss(text, now) {
  if (!text.includes('<rss')) throw new Error(`Not an RSS feed: ${text.slice(0, 120)}`);
  const items = text.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item) => ({
      title: tag(item, 'title'),
      url: articleUrl(tag(item, 'link')),
      source: tag(item, 'News:Source'),
      published: new Date(tag(item, 'pubDate')),
    }))
    .filter((a) => a.url.startsWith('https://')) // only real web links, never "javascript:" etc.
    .filter((a) => now - a.published < DAY_MS)
    .sort((a, b) => b.published - a.published);
}

export async function loadNews(place, now) {
  return parseRss(await fetchText(newsUrl(place)), now);
}

export function renderNews(place, articles, now, max = 12) {
  if (articles.length === 0) return `<p class="dim">No English news about "${esc(place)}" in the last 24 h.</p>`;
  return `<ul class="list">${articles.slice(0, max).map((a) => `
    <li><span class="dim">${ago(a.published, now)} · ${esc(a.source)}</span><br>
      <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></li>`).join('')}
  </ul>`;
}
