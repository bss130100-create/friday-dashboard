// Cloudflare Worker: a tiny relay that adds the CORS header browsers need.
// Bing News and the Cloudflare Radar API send no CORS header, so a page on github.io
// may not read them directly. This relay forwards to a few FIXED upstreams only,
// so it cannot be abused as an open proxy.
//
//   GET /news?q=brussels  ->  Bing News RSS search, English (US market)
//                            (Google News answers Cloudflare's servers with 503 "Sorry...", so Bing it is)
//   GET /attacks          ->  Cloudflare Radar: top attack origin -> target country pairs, last 24 h
//                             (needs the secret RADAR_TOKEN, see README)

const ALLOWED_ORIGIN = 'https://bss130100-create.github.io';
const RADAR_ATTACKS_URL =
  'https://api.cloudflare.com/client/v4/radar/attacks/layer7/top/attacks?limit=25&dateRange=1d&format=JSON';

// Returns { url, headers } for the upstream request, or throws RangeError for bad input.
export function upstreamRequest(requestUrl, env) {
  const url = new URL(requestUrl);
  if (url.pathname === '/news') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2 || q.length > 80) throw new RangeError('q must be 2-80 characters');
    const params = new URLSearchParams({ q, format: 'rss', setlang: 'en-US', mkt: 'en-US' });
    return { url: `https://www.bing.com/news/search?${params}`, headers: { 'User-Agent': 'friday-dashboard-relay' } };
  }
  if (url.pathname === '/attacks') {
    if (!env.RADAR_TOKEN) throw new RangeError('RADAR_TOKEN secret is not set on this Worker');
    return { url: RADAR_ATTACKS_URL, headers: { Authorization: `Bearer ${env.RADAR_TOKEN}` } };
  }
  throw new RangeError(`unknown path ${url.pathname}`);
}

export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };
    let target;
    try {
      target = upstreamRequest(request.url, env);
    } catch (err) {
      return new Response(err.message, { status: 400, headers: cors });
    }
    try {
      const upstream = await fetch(target.url, { headers: target.headers });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain' },
      });
    } catch (err) {
      return new Response(`upstream failed: ${err.message}`, { status: 502, headers: cors });
    }
  },
};
