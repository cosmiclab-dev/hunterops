// HunterOps notifications. Shows each push and opens the right screen when tapped.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'HunterOps', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'HunterOps', {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { href: data.href || '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/notifications';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(href); return; }
    }
    await self.clients.openWindow(href);
  })());
});
