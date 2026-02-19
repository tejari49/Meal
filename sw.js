/* TimeRoster GitHub Pages PWA Service Worker
   - Offline app shell
   - Simple runtime caching for external CDNs
*/
const CACHE_NAME = 'timeroster-ghpwa-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

async function cachePutSafe(cache, request, response) {
  try {
    // Don't cache errors
    if (!response || response.status === 0) {
      // opaque (status 0) is OK to cache
      await cache.put(request, response.clone());
      return;
    }
    if (response.ok) {
      await cache.put(request, response.clone());
    }
  } catch (e) {
    // ignore cache failures (quota, opaque restrictions, etc.)
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // SPA / navigation: network-first, fallback to cached index
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        await cachePutSafe(cache, './index.html', net);
        return net;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin: cache-first, then update
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const net = await fetch(req);
        await cachePutSafe(cache, req, net);
        return net;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Cross-origin (CDNs): stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const fetchPromise = (async () => {
      try {
        const net = await fetch(req);
        await cachePutSafe(cache, req, net);
        return net;
      } catch (e) {
        return null;
      }
    })();

    return cached || (await fetchPromise) || Response.error();
  })());
});
