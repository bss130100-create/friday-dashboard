// Small wrappers around fetch() that FAIL LOUDLY.
// fetch() only rejects on network errors; a 404 or 500 still "succeeds".
// These helpers turn any non-2xx answer or timeout into a thrown Error.

const TIMEOUT_MS = 15000;

async function request(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : err.message;
    throw new Error(`Network error for ${new URL(url).host}: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  }
  return response;
}

export async function fetchJson(url) {
  return (await request(url)).json();
}

export async function fetchText(url) {
  return (await request(url)).text();
}
