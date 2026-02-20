/* TimeRoster GitHub Pages PWA Service Worker
   - Offline app shell caching
   - Firebase Cloud Messaging (background push)
*/

const CACHE_NAME = 'timeroster-ghpwa-v5';

// GitHub Pages: nimm automatisch den Scope (z.B. https://tejari49.github.io/Meal/)
const APP_SCOPE = self.registration.scope;     // endet mit /
const APP_URL = APP_SCOPE;                      // Start-URL = Scope

// App-Shell: immer relativ zum Scope
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ---- Firebase Messaging (Compat) ----
// Compat builds, weil SW-Umgebung hier i.d.R. kein ESM-import unterstützt.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCLqi-PxHdeyt51u9i50tY0NhOAUbutW9g",
  authDomain: "calender-rai.firebaseapp.com",
  projectId: "calender-rai",
  storageBucket: "calender-rai.firebasestorage.app",
  messagingSenderId: "989981793002",
  appId: "1:989981793002:web:d23ba8bf2c30d6b8649593",
  measurementId: "G-CZLXPHK9GK"
});

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  // wenn Messaging nicht verfügbar ist, läuft SW trotzdem weiter (offline cache etc.)
}

// Background messages
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    try {
      const title = 'Kalender aktualisiert';
      const body = 'Es gibt neue Updates.';

      // url aus payload.data.url; kann relativ sein -> immer absolut machen
      const rawUrl = payload?.data?.url || APP_URL;
      const targetUrl = new URL(rawUrl, APP_URL).href;

      self.registration.showNotification(title, {
        body,
        tag: 'timeroster-update',
        data: { url: targetUrl },
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png'
      });
    } catch (e) {
      // ignore
    }
  });
}

// Notification click -> Fokus auf bestehendes Fenster oder neues öffnen
self.addEventListener('notificationclick', (event) => {
  event.notification?.close();

  const rawUrl = event.notification?.data?.url || APP_URL;
  const targetUrl = new URL(rawUrl, APP_URL).href;

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Wenn ein Tab bereits in unserem Scope offen ist -> fokussieren
    for (const client of allClients) {
      try {
        if (client.url && client.url.startsWith(APP_URL)) {
          await client.focus();
          // optional: navigieren, falls eine spezielle URL angefordert wurde
          if (client.url !== targetUrl && 'navigate' in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      } catch (e) {}
    }

    // sonst neu öffnen
    await clients.openWindow(targetUrl);
  })());
});

// ---- App Shell Caching ----
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Jede Datei einzeln cachen -> fehlende Datei bricht Install nicht
    await Promise.all(APP_SHELL.map(async (p) => {
      try {
        await cache.add(new Request(p, { cache: 'reload' }));
      } catch (e) {
        // ignore single failures
      }
    }));

    await self.skipWaiting();
  })());
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
    if (!response) return;

    // opaque (status 0) oder ok -> speichern
    if (response.status === 0 || response.ok) {
      await cache.put(request, response.clone());
    }
  } catch (e) {}
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigation: network-first -> update cache -> fallback index.html (SPA/PWA)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const net = await fetch(req);
        await cachePutSafe(cache, './index.html', net);
        return net;
      } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin: cache-first
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

  // Cross-origin: stale-while-revalidate (best effort)
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
