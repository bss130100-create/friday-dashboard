// Phone alerts: when MIAP pushes (relay/alerts.js) and how the Worker stores devices and sends (relay/worker.js).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { commuteWindow, watchedRoutes, tripEvents, commuteEvents } from '../relay/alerts.js';
import worker, { pushKey, subscribe, notify, settings } from '../relay/worker.js';
import { b64url } from '../relay/push.js';
import { supported, keyBytes, renderAlerts, alertState, enableAlerts, sendTest } from '../js/alerts.js';

// Monday 26 Oct 2026, Brussels = UTC+1 (summer time ended on the 25th)
const MON = (hhmmZ) => new Date(`2026-10-26T${hhmmZ}:00Z`);
const place = (name) => ({ name, lat: 50.8, lon: 4.3 });
const CONFIG = { home: { name: 'Home St 1', lat: 50.82, lon: 4.33 }, works: [{ label: 'Office A', place: place('A') }, { label: 'Office B', place: place('B') }] };

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isQuery = (sql) => /^\s*SELECT/i.test(sql);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    exec: () => (isQuery(sql) ? { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) } : db.prepare(sql).run(...params)),
    run: async () => stmt(sql, params).exec(),
    all: async () => stmt(sql, params).exec(),
    first: async () => { const row = db.prepare(sql).get(...params); return row ? { ...row } : null; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s.exec()) };
}
afterEach(() => delete globalThis.fetch);

const trip = (scheduledZ, startZ, extra = {}) => ({
  scheduled: MON(scheduledZ), start: MON(startZ), delayMin: Math.round((MON(startZ) - MON(scheduledZ)) / 60000),
  cancelled: false, legs: ["walk 2'", 'train S2'], stops: ['Bruxelles-Midi/Brussel-Zuid', 'Halle'], ...extra,
});
const disruption = (title, planned = false) => ({ title, planned, time: MON('05:30') });

test('windows: weekdays 08:00-09:00 and 15:30-17:30 Brussels time only', () => {
  // MON is in UTC; Brussels is UTC+1 on that Monday
  assert.equal(commuteWindow(MON('07:00')), 'morning'); // 08:00
  assert.equal(commuteWindow(MON('07:59')), 'morning'); // 08:59
  assert.equal(commuteWindow(MON('08:00')), null); // 09:00
  assert.equal(commuteWindow(MON('06:59')), null); // 07:59
  assert.equal(commuteWindow(MON('14:30')), 'evening'); // 15:30
  assert.equal(commuteWindow(MON('16:29')), 'evening'); // 17:29
  assert.equal(commuteWindow(MON('16:30')), null); // 17:30
  assert.equal(commuteWindow(new Date('2026-10-24T07:00:00Z')), null); // Saturday
  assert.deepEqual(watchedRoutes(CONFIG, 'morning').map((r) => r.label), ['Home → Office A', 'Home → Office B']);
  assert.deepEqual(watchedRoutes(CONFIG, 'evening').map((r) => r.label), ['Office A → Home', 'Office B → Home']);
});

test('trip events: cancelled, 5+ min late, live SNCB disruption on its stations', () => {
  const now = MON('06:00');
  const trips = [
    trip('06:10', '06:17'), // +7 -> alert
    trip('06:30', '06:30', { cancelled: true }), // -> alert
    trip('06:40', '06:43'), // +3 -> quiet
    trip('07:30', '07:30', { cancelled: true }), // more than an hour away -> quiet
  ];
  const disruptions = [
    disruption('Brux.-Midi/Brus.-Zuid - Halle: Disrupted traffic'), // on the trip -> alert
    disruption('Brux.-Midi/Brus.-Zuid - Halle: Works', true), // planned works -> quiet
    disruption('Leuven - Ottignies: No trains'), // elsewhere -> quiet
  ];
  const events = tripEvents('Home → Office A', trips, disruptions, now);
  assert.deepEqual(events.map((e) => e.title), ['+7 min · Home → Office A', 'Cancelled · Home → Office A', 'SNCB disruption · Home → Office A']);
  assert.match(events[0].body, /^07:10 train S2 now leaves at 07:17\.$/);
  // the key follows the timetable, so a delay growing from 7 to 9 min is not pushed again
  const later = tripEvents('Home → Office A', [trip('06:10', '06:19')], [], now);
  assert.equal(later[0].key, events[0].key);
});

test('commute check: nothing fetched outside the windows; inside, one request at a time', async () => {
  const asked = [];
  const getJson = async (url) => {
    asked.push(url);
    return url.includes('irail') ? { disturbance: [] } : { itineraries: [] };
  };
  assert.deepEqual(await commuteEvents(CONFIG, MON('12:00'), getJson), []);
  assert.equal(asked.length, 0);
  assert.deepEqual(await commuteEvents(CONFIG, MON('07:00'), getJson), []);
  assert.equal(asked.length, 3); // disruptions + the two morning routes
});

async function subscription(endpoint) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return { endpoint, keys: { p256dh, auth: b64url(crypto.getRandomValues(new Uint8Array(16))) } };
}
const post = (body) => new Request('https://miap.test/push/subscribe', { method: 'POST', body: JSON.stringify(body) });

test('push: key made once, devices saved, each event pushed once, gone devices removed', async () => {
  const env = { DB: fakeD1() };
  const key = await pushKey(env);
  assert.deepEqual(await pushKey(env), key);
  await assert.rejects(subscribe(env, post({ endpoint: 'http://x', keys: {} })), RangeError);
  await subscribe(env, post(await subscription('https://web.push.apple.com/phone')));
  assert.deepEqual(await subscribe(env, post(await subscription('https://fcm.googleapis.com/old'))), { devices: 2 });

  const pushed = [];
  globalThis.fetch = async (url, init) => {
    assert.match(init.headers.Authorization, /^vapid t=.+, k=/);
    pushed.push(url);
    return new Response('', { status: url.includes('old') ? 410 : 201 });
  };
  const events = [{ key: 'a', title: 'A', body: '1' }, { key: 'b', title: 'B', body: '2' }];
  assert.equal(await notify(env, events), 2); // phone gets both; the old device answers 410 once
  assert.equal(await notify(env, events), 0); // already sent: quiet
  assert.equal(pushed.filter((u) => u.includes('old')).length, 1);
  assert.deepEqual(await subscribe(env, post(await subscription('https://web.push.apple.com/tablet'))), { devices: 2 });
});

test('push: a failing push service is an error, and the event is retried next time', async () => {
  const env = { DB: fakeD1() };
  await subscribe(env, post(await subscription('https://web.push.apple.com/phone')));
  globalThis.fetch = async () => new Response('busy', { status: 503 });
  await assert.rejects(notify(env, [{ key: 'a', title: 'A', body: '1' }]), /HTTP 503/);
  globalThis.fetch = async () => new Response('', { status: 201 });
  assert.equal(await notify(env, [{ key: 'a', title: 'A', body: '1' }]), 1);
});

test('cron: the 5-minute job does nothing until addresses are saved', async () => {
  const env = { DB: fakeD1() };
  globalThis.fetch = async (url) => { throw new Error(`unexpected ${url}`); };
  await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: MON('07:00').getTime() }, env);
  assert.equal(await settings(env, new Request('https://miap.test/settings/commute'), 'commute'), null);
});

// ---------- the page side (js/alerts.js) ----------

test('page: support check, key decoding, status text', async () => {
  assert.equal(supported({ navigator: { serviceWorker: {} }, PushManager: 1, Notification: 1 }), true);
  assert.equal(supported({ navigator: {}, Notification: 1 }), false); // iPhone Safari tab, not the Home Screen app
  const bytes = crypto.getRandomValues(new Uint8Array(65));
  assert.deepEqual(keyBytes(b64url(bytes)), bytes);
  const reg = (sub) => ({ pushManager: { getSubscription: async () => sub } });
  assert.equal(await alertState(reg({}), 'granted'), 'on');
  assert.equal(await alertState(reg(null), 'default'), 'off');
  assert.equal(await alertState(reg(null), 'denied'), 'blocked');
  assert.match(renderAlerts('blocked'), /Settings › Notifications/);
});

test('page: enabling sends the subscription to the Worker; a test with no device is an error', async () => {
  const sub = { endpoint: 'https://web.push.apple.com/phone', keys: { p256dh: 'p', auth: 'a' } };
  const reg = { pushManager: { subscribe: async (opts) => { assert.equal(opts.userVisibleOnly, true); return { toJSON: () => sub }; } } };
  globalThis.fetch = async (url, init) => {
    assert.equal(init.method, 'POST');
    if (url === '/push/subscribe') { assert.deepEqual(JSON.parse(init.body), sub); return Response.json({ devices: 1 }); }
    return Response.json({ sent: 0 });
  };
  assert.deepEqual(await enableAlerts(reg, new Uint8Array(65)), { devices: 1 });
  await assert.rejects(sendTest(), /Enable alerts first/);
});
