/* eslint-disable no-undef */
/**
 * Handler de Web Push — Essência do Cuidar
 *
 * Fica num arquivo separado de propósito: é importado por DOIS service
 * workers, garantindo que o comportamento do push seja idêntico em dev e
 * em produção.
 *
 *   • dev  → frontend/public/sw.js          → importScripts('/push-handler.js')
 *   • prod → frontend/dist/sw.js (Workbox)   → importScripts('/push-handler.js')
 *            (configurado em vite.config.ts → workbox.importScripts)
 *
 * Payload enviado pelo backend (backend/src/services/push.js):
 *   { title: string, body: string, data: { url: string } }
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Payload não-JSON: usa o texto cru como corpo.
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Essência do Cuidar';
  const options = {
    body: payload.body || '',
    icon: '/img/logo.jpg',
    badge: '/img/logo.jpg',
    data: payload.data || {},
    tag: payload.tag || 'essencia-push',
    renotify: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Clique na notificação: foca uma aba já aberta na rota pedida ou abre uma nova.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          // Navega a aba existente para a rota da notificação.
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* aba já está na rota — ignora */
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});
