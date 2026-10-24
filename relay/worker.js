// Cloudflare Worker: a tiny relay that adds the CORS header browsers need.
// Google News has no CORS header, so a page on github.io may not read it directly.
// This relay only forwards to ONE fixed upstream, so it cannot be abused as an open proxy.
//
//   GET /news?q=brussels  ->  Google News RSS: English articles from the last 24 h

const ALLOWED_ORIGIN = 'https://bss130100-create.github.io';

export function upstreamUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname !== '/news') throw new RangeError(`unknown path ${url.pathname}`);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 80) throw new RangeError('q must be 2-80 characters');
  const params = new URLSearchParams({ q: `${q} when:1d`, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  return `https://news.google.com/rss/search?${params}`;
}

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };
    let target;
    try {
      target = upstreamUrl(request.url);
    } catch (err) {
      return new Response(err.message, { status: 400, headers: cors });
    }
    try {
      const upstream = await fetch(target);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain' },
      });
    } catch (err) {
      return new Response(`upstream failed: ${err.message}`, { status: 502, headers: cors });
    }
  },
};
