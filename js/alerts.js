// Phone alerts panel: subscribes this device to MIAP's push alerts (Web Push).
// The Worker decides when to push (relay/alerts.js); sw.js shows the notification.
// iPhone: needs iOS 16.4+ and MIAP opened from its Home Screen icon (Safari tabs can't get pushes).
import { fetchJson, sendJson } from './http.js';

export function supported(win) {
  return 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win;
}

// The Worker's public key (base64url text) -> the bytes subscribe() wants.
export function keyBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

export const UNSUPPORTED = `<p class="warm">This browser can't get alerts here.</p>
  <p class="dim small">On iPhone: Share › Add to Home Screen, then open MIAP from that icon and tap Enable alerts.</p>`;

export function renderAlerts(state) {
  if (state === 'on') return '<p><span class="tag cool">ON</span> This device gets MIAP alerts. Tap Send test to check.</p>';
  if (state === 'blocked') return '<p class="hot">Notifications are blocked for MIAP.</p><p class="dim small">iPhone: Settings › Notifications › MIAP › Allow Notifications.</p>';
  return '<p class="dim">Alerts are off on this device. Tap Enable alerts.</p>';
}

export async function alertState(registration, permission) {
  if (permission === 'denied') return 'blocked';
  return (await registration.pushManager.getSubscription()) ? 'on' : 'off';
}

export async function loadPushKey() {
  return keyBytes((await fetchJson('/push/key')).publicKey);
}

// Must run straight from the tap (no await before subscribe): iOS only asks for permission inside a user gesture.
export async function enableAlerts(registration, key) {
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sendJson('/push/subscribe', 'POST', subscription.toJSON());
}

export async function sendTest() {
  const { sent } = await sendJson('/push/test', 'POST', {});
  if (!sent) throw new Error('no device is subscribed: tap Enable alerts first');
  return `<p>Test sent to ${sent} device${sent > 1 ? 's' : ''}. It should pop up within a few seconds.</p>`;
}
