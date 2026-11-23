import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Remove os avatares 3D do bundle publicado.
 *
 * `frontend/public/avatars/` tem 6 arquivos .glb (25 MB) que NENHUM código
 * do frontend usa — não há three.js, react-three-fiber nem componente que
 * carregue `/avatars/*.glb` (a única referência é o manifest.json ao lado).
 *
 * Como o Vite copia `public/` inteiro para `dist/`, esses 25 MB iam parar
 * no bundle: 93% do payload do deploy, o que estourava a memória do runner
 * do GitHub Actions (7 GB em repositório público) e matava o job de deploy
 * com "Out of memory".
 *
 * Os arquivos continuam versionados no repo (frontend/public/avatars/) —
 * só não são publicados. Se a feature 3D entrar, é só remover este plugin.
 */
function removeUnusedAvatars(): Plugin {
  return {
    name: 'remove-unused-avatars',
    closeBundle() {
      const dir = path.resolve(__dirname, 'dist/avatars');
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('  [avatars] .glb não utilizados removidos do dist/ (25 MB fora do deploy)');
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    removeUnusedAvatars(),
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
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
        'og-image.png'
      ],
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
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
