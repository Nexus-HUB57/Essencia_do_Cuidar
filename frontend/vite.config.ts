import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // O registro é feito em src/main.tsx (registro manual, com log de erro).
      // O plugin também injetaria um registerSW.js — dois registros do mesmo
      // /sw.js não agregam nada e poluem o console.
      injectRegister: null,
      // Em dev o plugin não gera o manifest (o /manifest.webmanifest cairia
      // no fallback da SPA e voltaria HTML). Com devOptions o manifest é
      // servido em desenvolvimento também.
      devOptions: {
        enabled: true
      },
      includeAssets: ['favicon.svg', 'img/logo.jpg'],
      manifest: {
        name: 'Essência do Cuidar',
        short_name: 'Essência',
        description: 'Marketplace de profissionais de saúde para cuidado domiciliar',
        lang: 'pt-BR',
        theme_color: '#4A90E2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'img/logo.jpg',
            sizes: '640x640',
            type: 'image/jpeg',
            purpose: 'any maskable'
          }
        ]
      },
      // O SW gerado pelo Workbox cuida do precache, mas NÃO sabe tratar
      // push. Sem isto, as notificações push nunca aparecem em produção.
      // O handler vive em public/push-handler.js — o mesmo arquivo usado
      // pelo service worker de dev (public/sw.js).
      workbox: {
        importScripts: ['/push-handler.js']
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      // O Socket.IO conecta na raiz do backend, não em /api.
      // Sem esta entrada o handshake cai no fallback da SPA (HTML) e o
      // realtime (matchings, candidaturas, mensagens) nunca conecta em dev.
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true
      }
    }
  }
});
