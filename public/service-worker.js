const CACHE_NAME = 'schematics-app-cache-v2';
// Normalise resources so installs served from sub-paths resolve correctly.
const scopeUrl = self.registration?.scope ?? self.location.origin;
const resources = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/app-icon.svg'
];

const APP_SHELL = resources.map((resource) => new URL(resource, scopeUrl).toString());
const INDEX_HTML = new URL('./index.html', scopeUrl).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match(INDEX_HTML);
          }

          return new Response('Offline', {
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});
