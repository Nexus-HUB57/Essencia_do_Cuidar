/* eslint-disable no-undef */
/**
 * Service worker de DEV — Essência do Cuidar
 *
 * Em produção quem serve /sw.js é o Workbox (gerado pelo vite-plugin-pwa
 * no build); ele faz o precache e importa o handler de push.
 *
 * Em dev o plugin não gera nada, e o vite devolvia index.html para
 * /sw.js — o Chrome recusava o script ("unsupported MIME type text/html")
 * e o registro falhava. Como `navigator.serviceWorker.ready` só resolve
 * quando existe um SW ativo, o botão "Ativar push" ficava pendurado para
 * sempre, sem erro e sem retorno.
 *
 * Este arquivo é o SW de dev: importa o mesmo handler de push da produção
 * e não cacheia nada (o app é API-driven e o fallback SPA precisa
 * continuar funcionando).
 */

importScripts('/push-handler.js');

self.addEventListener('install', () => {
  // Assume o controle imediatamente — não esperamos todas as abas fecharem.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpa qualquer cache de versões anteriores deste SW.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('essencia-')).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Sem handler de 'fetch' de propósito: todo GET (inclusive /api/*) vai
 * direto para a rede.
 */
