// Small wrappers around fetch() that FAIL LOUDLY.
// fetch() only rejects on network errors; a 404 or 500 still "succeeds".
// These helpers turn any non-2xx answer or timeout into a thrown Error.

const TIMEOUT_MS = 15000;

// Other sites are named by host; our own Worker's paths ('/history?...') by the path itself.
function source(url) {
  return /^https?:/.test(url) ? new URL(url).host : url;
}

async function request(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : err.message;
    // Our own Worker is behind the Cloudflare Access login: when the login expires, its answer is a
    // redirect to the login page, which the browser reports only as a network error.
    if (!/^https?:/.test(url)) throw new Error(`Network error for ${url}: ${reason} (login expired? reload the page)`);
    throw new Error(`Network error for ${source(url)}: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${source(url)}`);
  }
  return response;
}

export async function fetchJson(url) {
  return (await request(url)).json();
}

export async function fetchText(url) {
  return (await request(url)).text();
}
