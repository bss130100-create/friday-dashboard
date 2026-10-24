// Service worker: shows MIAP's phone alerts, even when MIAP is closed.
// The Worker sends { title, body, url } (see relay/worker.js, notify).
self.addEventListener('push', (event) => {
  const msg = event.data.json();
  event.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, icon: '/icons/icon-192.png', data: { url: msg.url } }));
});

// Tapping an alert opens MIAP on the page it points to (the Commute tab).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url));
});
