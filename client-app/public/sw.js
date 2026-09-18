// Minimal service worker for Web Push (tap notifications) -- no offline
// caching/PWA behavior, this exists purely to receive push events and
// show a system notification while the dashboard tab isn't focused.
// Registered from NotificationBell.jsx via navigator.serviceWorker.register('/sw.js').

self.addEventListener('push', (event) => {
  let data = { title: 'huntsTAG', body: 'You have a new notification' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* fall back to the default text above */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/huntsTAG-favi.png',
    })
  );
});

// Focuses an already-open dashboard tab if one exists, otherwise opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/dashboard') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/dashboard');
    })
  );
});
