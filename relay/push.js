// Web Push from the Worker, with only the built-in WebCrypto (no library):
//   - VAPID (RFC 8292): a key pair that identifies this Worker to Apple's/Google's push services.
//     Created on first use and kept in the D1 database, so no secret has to be pasted anywhere.
//   - Payload encryption (RFC 8291, "aes128gcm"): only the subscribed device can read the message.
// A subscription = { endpoint, keys: { p256dh, auth } }, made by the browser (see js/alerts.js).

const SUBJECT = 'https://github.com/bss130100-create/friday-dashboard'; // who runs this sender (required by Apple)
const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ---------- VAPID keys (stored as JWK in the settings table) ----------

export async function newVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { jwk, publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) };
}

// Authorization header value for one push service (aud = its origin), valid 12 h.
export async function vapidAuth(vapid, endpoint, nowMs) {
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: SUBJECT })));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${vapid.publicKey}`;
}

// ---------- RFC 8291 encryption ----------
// salt and serverKeys are random per message; tests pass fixed ones to check against the RFC example.
export async function encrypt(plaintext, subscriptionKeys, { salt, serverKeys } = {}) {
  const uaPublic = unb64url(subscriptionKeys.p256dh);
  const authSecret = unb64url(subscriptionKeys.auth);
  salt ??= crypto.getRandomValues(new Uint8Array(16));
  serverKeys ??= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  const ikm = await hmac(await hmac(authSecret, shared), concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, [1]));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), [1]))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, [2])));
  const header = concat(salt, [0, 0, 16, 0], [asPublic.length], asPublic); // record size 4096
  return concat(header, sealed);
}

// Send one message ({ title, body, url }) to one subscription. Returns the push service's status:
// 201 = delivered to the service; 404/410 = the subscription is gone (caller deletes it).
export async function sendPush(subscription, message, vapid, nowMs = Date.now()) {
  const body = await encrypt(enc.encode(JSON.stringify(message)), subscription.keys);
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(vapid, subscription.endpoint, nowMs),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  });
  if (res.status !== 201 && res.status !== 404 && res.status !== 410) {
    throw new Error(`push to ${new URL(subscription.endpoint).host}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.status;
}
