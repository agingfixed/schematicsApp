const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `schematics-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `schematics-runtime-${CACHE_VERSION}`;
const BUILD_MANIFEST_URL = '/manifest.json';
const STATIC_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

const precachedPaths = new Set();

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const urlsToCache = new Set(
        STATIC_APP_SHELL.map(normalizePath).filter(Boolean)
      );

      try {
        const manifestRequest = new Request(BUILD_MANIFEST_URL, { cache: 'no-store' });
        const manifestResponse = await fetch(manifestRequest);
        if (manifestResponse.ok) {
          const manifestClone = manifestResponse.clone();
          const manifestJson = await manifestClone.json();
          const manifestPath = normalizePath(BUILD_MANIFEST_URL);
          if (manifestPath) {
            urlsToCache.add(manifestPath);
            precachedPaths.add(manifestPath);
          }
          collectManifestAssets(manifestJson, urlsToCache);
          await cache.put(manifestRequest, manifestResponse);
        }
      } catch (error) {
        console.warn('[Service Worker] Unable to precache build manifest.', error);
      }

      await cacheUrls(cache, urlsToCache);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(name => {
          if (name !== APP_SHELL_CACHE && name !== RUNTIME_CACHE) {
            return caches.delete(name);
          }
          return undefined;
        })
      );
      await clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(handleSameOriginRequest(event.request));
    return;
  }

  event.respondWith(fetch(event.request));
});

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    runtimeCache.put(request, response.clone());
    return response;
  } catch (error) {
    const fallback = await matchIndexDocument();
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}

async function handleSameOriginRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    runtimeCache.put(request, response.clone());
    return response;
  } catch (error) {
    if (request.destination === 'document' || request.mode === 'navigate') {
      const fallback = await matchIndexDocument();
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
}

async function matchIndexDocument() {
  const cache = await caches.open(APP_SHELL_CACHE);
  const index = await cache.match('/index.html');
  if (index) {
    return index;
  }
  return cache.match('/');
}

async function cacheUrls(cache, urls) {
  const absoluteUrls = Array.from(urls)
    .map(path => toAbsoluteUrl(path))
    .filter(Boolean);

  for (const url of absoluteUrls) {
    const path = normalizePath(url);
    if (!path || precachedPaths.has(path)) {
      continue;
    }

    try {
      const response = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!response.ok) {
        throw new Error(`Unexpected response (${response.status}) while caching ${url}`);
      }
      await cache.put(url, response.clone());
      precachedPaths.add(path);
    } catch (error) {
      console.warn(`[Service Worker] Failed to cache ${url}.`, error);
    }
  }
}

function collectManifestAssets(manifest, urls) {
  if (!manifest || typeof manifest !== 'object') {
    return;
  }

  for (const value of Object.values(manifest)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    addAssetPath(value.file, urls);
    if (Array.isArray(value.css)) {
      value.css.forEach(asset => addAssetPath(asset, urls));
    }
    if (Array.isArray(value.assets)) {
      value.assets.forEach(asset => addAssetPath(asset, urls));
    }
  }
}

function addAssetPath(asset, urls) {
  if (!asset || typeof asset !== 'string') {
    return;
  }
  const normalized = normalizePath(asset);
  if (normalized) {
    urls.add(normalized);
  }
}

function normalizePath(path) {
  try {
    const url = new URL(path, self.location.origin);
    return url.pathname + url.search;
  } catch (error) {
    console.warn('[Service Worker] Failed to normalise path.', path, error);
    return null;
  }
}

function toAbsoluteUrl(path) {
  try {
    return new URL(path, self.location.origin).toString();
  } catch (error) {
    console.warn('[Service Worker] Failed to resolve absolute URL for', path, error);
    return null;
  }
}
