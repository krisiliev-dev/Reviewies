/**
 * Push handlers, injected into the generated service worker.
 *
 * Kept separate from the Workbox-generated file so precaching stays generated and
 * this stays hand-written.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Reviewies', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Reviewies', {
      body: payload.body ?? '',
      // Tagging by episode collapses repeats rather than stacking duplicates.
      tag: payload.targetId ?? 'reviewies',
      data: { url: payload.url ?? '/' },
      badge: '/icon-192.png',
      icon: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing tab rather than opening a duplicate.
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
