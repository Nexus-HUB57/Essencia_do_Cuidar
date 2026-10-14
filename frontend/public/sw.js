// Service Worker mínimo do Essência do Cuidar
// Estratégia:
//   - HTML (navegação): network-first, fallback para cache (offline-first "lite")
//   - Assets estáticos (JS, CSS, imagens, fontes): stale-while-revalidate
//   - API (/api/*): network-only (não cacheia — dados precisam estar sempre frescos)
//
// Versão: bumpar CACHE_NAME força invalidar caches antigos em deploys.

const CACHE_NAME = 'edc-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: sempre rede, sem cache
  if (url.pathname.startsWith('/api/')) return;

  // Navegação (HTML): network-first, fallback cache
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
