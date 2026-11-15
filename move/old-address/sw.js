/* global self, caches */
// Replaces the old app's service worker on klansagan.godvig.com: it removes itself and its
// caches, so returning visitors get the page that sends them to saga.godvig.com.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
