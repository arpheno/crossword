// Crossword application-shell service worker (ADR 0006).
// Cache ownership: this worker owns ONLY caches under the shell prefix below.
// Speech caches (transformers-cache) and model caches (webllm/*) are owned by
// their subsystems and are never deleted here.
const CACHE_NAME = 'crossword-shell-v4';
const SHELL_CACHE_PREFIX = 'crossword-shell-v';
// Replaced at build time with the exact emitted-asset precache manifest
// (see apps/web/scripts/generate-sw-precache.mjs). The fallback keeps the
// minimal dev shell when the file is served unprocessed.
const PRECACHE_URLS = self.__CROSSWORD_PRECACHE__ || ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(event.request)).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }
  // Subresource requests: cache-first within the shell cache, network
  // fallback, and never an HTML substitution for a missing module, worker,
  // data file, or manifest (ADR 0006).
  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(event.request))
      .then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }))
  );
});
