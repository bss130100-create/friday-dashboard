// Web Push crypto, checked against the worked example in RFC 8291 (Appendix A / section 5).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { b64url, unb64url, encrypt, newVapidKeys, vapidAuth, sendPush } from '../relay/push.js';

afterEach(() => { delete globalThis.fetch; });

const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function rfcServerKeys() {
  const pub = unb64url(RFC.asPublic);
  const jwk = { kty: 'EC', crv: 'P-256', d: RFC.asPrivate, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33)) };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return { privateKey, publicKey };
}

test('base64url round trip without padding', () => {
  const bytes = new Uint8Array([251, 255, 0, 1, 2]);
  assert.equal(b64url(bytes), '-_8AAQI');
  assert.deepEqual(unb64url('-_8AAQI'), bytes);
});

test('encrypt reproduces the RFC 8291 example byte for byte', async () => {
  const body = await encrypt(new TextEncoder().encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth },
    { salt: unb64url(RFC.salt), serverKeys: await rfcServerKeys() });
  assert.equal(b64url(body), RFC.body);
});

test('VAPID header: ES256 token for the push service origin, verifiable with the public key', async () => {
  const vapid = await newVapidKeys();
  const now = Date.parse('2026-10-24T18:00:00Z');
  const header = await vapidAuth(vapid, 'https://web.push.apple.com/QGuQyavXutnMH', now);
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, vapid.publicKey);
  const [h, b, s] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(unb64url(b)));
  assert.deepEqual(claims, { aud: 'https://web.push.apple.com', exp: now / 1000 + 43200, sub: 'https://github.com/bss130100-create/friday-dashboard' });
  const pub = await crypto.subtle.importKey('raw', unb64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64url(s), new TextEncoder().encode(`${h}.${b}`)));
});

test('sendPush posts an encrypted body; gone subscriptions report 410, other errors throw', async () => {
  const vapid = await newVapidKeys();
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sub = {
    endpoint: 'https://web.push.apple.com/abc',
    keys: { p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64url(new Uint8Array(16).fill(7)) },
  };
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(null, { status: 201 }); };
  assert.equal(await sendPush(sub, { title: 'T', body: 'B' }, vapid), 201);
  assert.equal(sent.url, sub.endpoint);
  assert.equal(sent.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(sent.init.headers.TTL, '3600');
  assert.ok(sent.init.body.length > 86 + 16); // header + ciphertext + tag
  globalThis.fetch = async () => new Response(null, { status: 410 });
  assert.equal(await sendPush(sub, { title: 'T' }, vapid), 410);
  globalThis.fetch = async () => new Response('{"reason":"BadJwtToken"}', { status: 403 });
  await assert.rejects(sendPush(sub, { title: 'T' }, vapid), /web\.push\.apple\.com: HTTP 403 \{"reason":"BadJwtToken"\}/);
});
