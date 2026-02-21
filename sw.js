/* TimeRoster Service Worker
 * - Offline cache (basic)
 * - Firebase Cloud Messaging: background notifications
 *
 * Place this file next to index.html at your site root (same folder as the HTML).
 */

const CACHE_NAME = 'timeroster-cache-v20260221d';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// ---- Offline cache (safe defaults) ----
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
      } catch (_) {
        // Non-fatal (e.g., missing manifest/icons)
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';

  // Network-first for HTML (so updates ship), cache fallback if offline
  if (accept.includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (_) {
          return (await caches.match(req)) || (await caches.match('./index.html')) || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      try {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      } catch (_) {}
      return fresh;
    })()
  );
});

// ---- Firebase Cloud Messaging (background) ----
// NOTE: This uses compat libs because they work cleanly inside SW.
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCLqi-PxHdeyt51u9i50tY0NhOAUbutW9g",
  authDomain: "calender-rai.firebaseapp.com",
  projectId: "calender-rai",
  storageBucket: "calender-rai.firebasestorage.app",
  messagingSenderId: "989981793002",
  appId: "1:989981793002:web:d23ba8bf2c30d6b8649593",
  measurementId: "G-CZLXPHK9GK",
});

const messaging = firebase.messaging();

// Background push handler
messaging.onBackgroundMessage((payload) => {
  try {
    const data = payload?.data || {};
    const title = payload?.notification?.title || data.title || 'TimeRoster';
    const body = payload?.notification?.body || data.body || 'Es gibt neue Updates.';
    const icon = data.icon || 'https://cdn-icons-png.flaticon.com/128/2693/2693507.png';

    const url = data.url || data.click_action || './';
    const tag = data.tag || `timeroster-${Date.now()}`;

    self.registration.showNotification(title, {
      body,
      icon,
      tag,
      data: { url, ...data },
    });
  } catch (e) {
    // swallow
  }
});

// Click → open / focus app
self.addEventListener('notificationclick', (event) => {
  event.notification?.close?.();
  const url = (event.notification && event.notification.data && event.notification.data.url) ? event.notification.data.url : './';

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Prefer an existing tab/window on same origin
      const sameOrigin = all.find((c) => (c.url || '').startsWith(self.location.origin));
      if (sameOrigin) {
        try { await sameOrigin.focus(); } catch (_) {}
        try { await sameOrigin.navigate(url); } catch (_) {}
        return;
      }
      try { await clients.openWindow(url); } catch (_) {}
    })()
  );
});
