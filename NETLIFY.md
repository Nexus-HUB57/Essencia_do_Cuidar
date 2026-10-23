# Deploy na Netlify — Essência do Cuidar

> Guia rápido para sincronizar 100% com a Netlify.

## ✅ Pré-requisitos (já configurados no repo)

- ✅ `netlify.toml` na raiz (configura build + redirects + headers)
- ✅ `frontend/public/_redirects` (fallback caso `netlify.toml` não seja lido)
- ✅ `frontend/public/_headers` (headers de segurança/cache fallback)
- ✅ `frontend/vite.config.ts` (PWA + proxy dev)
- ✅ `.github/workflows/deploy-netlify.yml` (CI opcional, deploy explícito)
- ✅ `frontend/package.json` com `build: vite build`
- ✅ Frontend builda em ~2s (177 módulos, PWA gerado)

---

## 🚀 Setup único (uma vez)

### Opção A: Via Dashboard Netlify (recomendado)

1. **https://app.netlify.com → Add new site → Import an existing project**
2. **Selecione `Nexus-HUB57/Essencia_do_Cuidar`** (conecte GitHub se ainda não)
3. **A Netlify lê o `netlify.toml` automaticamente e preenche:**
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Deploy site** (esse primeiro build pode demorar ~2min)

### Opção B: Via Netlify CLI (para dev local com `netlify dev`)

```bash
# Instalar CLI (uma vez)
npm install -g netlify-cli

# Login
netlify login

# Linkar repo local ao site Netlify (na pasta raiz do repo)
cd /path/to/Essencia_do_Cuidar
netlify link  # seleciona o site existente ou cria novo

# Deploy de preview (não afeta produção)
netlify deploy

# Deploy de produção
netlify deploy --prod

# Dev local com proxy (substitui `npm run dev`)
netlify dev  # porta 8888 com proxy /api → backend
```

---

## 🔧 Configuração pós-setup

### Variável de ambiente (opcional)

Acesse **Site settings → Environment variables**:

| Variável | Default | Quando ajustar |
|---|---|---|
| `VITE_API_URL` | `/api` (do `netlify.toml`) | Se backend estiver em outro domínio sem proxy Netlify — use URL absoluta como `https://api.seu-dominio.com/api` |

> ⚠️ Variável `VITE_*` é **build-time** — mudar exige novo deploy (não basta reiniciar)

### Domínio customizado (opcional)

**Site settings → Domain management → Add custom domain**:
- Adicione `meu-site.com.br`
- Configure DNS (CNAME para `meu-site.netlify.app`)
- TLS automático via Let's Encrypt

---

## 🔄 Sincronização automática (100%)

A cada `git push` em `main`, a Netlify:
1. Detecta o push via webhook GitHub
2. Lê `netlify.toml` da raiz
3. Roda `cd frontend && npm ci && npm run build`
4. Publica `frontend/dist/` no CDN global
5. Aplica redirects (`/api/*`, `/uploads/*`, `/socket.io/*` → backend) + SPA fallback
6. Aplica headers (segurança + cache)
7. Gera URL de preview + atualiza URL de produção

**Tempo médio: 1-3 minutos** desde o push até o site estar no ar.

---

## 🎯 O que está configurado no `netlify.toml`

### Redirects (proxy para backend em `essencia-backend.onrender.com`)

| Origem | Destino | Status |
|---|---|---|
| `/api/*` | `https://essencia-backend.onrender.com/api/:splat` | 200 (proxy) |
| `/uploads/*` | `https://essencia-backend.onrender.com/uploads/:splat` | 200 (proxy) |
| `/socket.io/*` | `https://essencia-backend.onrender.com/socket.io/:splat` | 200 (proxy WebSocket) |
| `/*` | `/index.html` | 200 (SPA fallback) |

⚠️ **Troque `essencia-backend.onrender.com` pelo seu backend real** (linha 35 do `netlify.toml`).
Outros exemplos:
- `https://essencia-backend.up.railway.app`
- `https://api.essencia-do-cuidar.app` (k8s Ingress com TLS)

### Headers de segurança

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: default-src 'self'; ...` (CSP completa)

### Headers de cache

- `/assets/*` → `public, max-age=31536000, immutable` (1 ano)
- `/sw.js` → `no-cache, must-revalidate`
- `/manifest.webmanifest` → `no-cache`
- `/img/*`, `/favicon.svg`, `/logo.jpg` → `public, max-age=604800` (7 dias)

---

## 📋 Checklist pós-deploy

```bash
# 1. Site no ar
curl -I https://meu-site.netlify.app
# esperado: HTTP/2 200

# 2. Imagens da marca (7 imagens)
for img in logo capa-trabalhamos sobre-nasceu servicos processo agenda-aberta cta-cuidado; do
  curl -o /dev/null -w "$img.jpg → %{http_code}\n" https://meu-site.netlify.app/img/$img.jpg
done
# esperado: todos 200

# 3. PWA
curl -o /dev/null -w "manifest → %{http_code}\n" https://meu-site.netlify.app/manifest.webmanifest
curl -o /dev/null -w "sw.js   → %{http_code}\n" https://meu-site.netlify.app/sw.js
# esperado: 200, 200

# 4. _redirects e _headers publicados (não devem aparecer no browser,
#    mas Netlify lê silenciosamente)
curl -o /dev/null -w "_redirects → %{http_code}\n" https://meu-site.netlify.app/_redirects
curl -o /dev/null -w "_headers → %{http_code}\n" https://meu-site.netlify.app/_headers
# esperado: 200, 200

# 5. API via proxy (precisa backend rodando)
curl https://meu-site.netlify.app/api/health
# esperado: {"ok":true,"service":"essencia-do-cuidar",...}

# 6. Headers de segurança (curl -I mostra)
curl -I https://meu-site.netlify.app | grep -E "X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security|Content-Security-Policy"
# esperado: todos presentes

# 7. SPA fallback (rota inexistente retorna index.html)
curl -o /dev/null -w "rota-inexistente → %{http_code}\n" https://meu-site.netlify.app/rota-inexistente
# esperado: 200 (React Router cuida)
```

E no navegador:
- [ ] Landing abre com as 7 imagens da marca
- [ ] Botão flutuante do WhatsApp abre `wa.me/5519988322428`
- [ ] Login demo: `maria@demo.com` / `demo1234`
- [ ] Cadastro wizard profissional funciona (autocomplete de profissões)
- [ ] Chat entre dois navegadores (sem duplicação — W1)
- [ ] PWA instalável (Chrome mobile → menu → "Instalar app")
- [ ] Language switcher (pt-BR / es / en) funciona
- [ ] Dark mode toggle funciona

---

## 🚑 Troubleshooting

### "Site mostra página em branco"

`netlify.toml` tem `base = "frontend"`. Confirme que o **Publish directory** no painel Netlify é `dist` (não `frontend/dist`).

### "API retorna 404"

Os redirects de proxy estão depois do catch-all? Não. A ordem no `netlify.toml` importa: proxy primeiro, `/*` → `index.html` por último. Verifique as linhas 30-55 do `netlify.toml`.

### "API retorna HTML em vez de JSON"

O catch-all `/*` está pegando `/api/*`. Causa: regras na ordem errada ou `force = false` nos redirects de proxy. O `netlify.toml` atual usa `force = true` em todos os 3 proxies.

### "Chat não conecta (WebSocket)"

O redirect de `/socket.io/*` precisa existir **e** ter `force = true`. Sem isso, cai no SPA fallback.

### "Imagens não aparecem"

Confirme que `frontend/public/img/*.jpg` foi commitado (`.gitignore` não deve ignorar `public/`). Cheque: `git ls-files frontend/public/img`.

### "Build falha: 'cannot find module'"

Confira que `frontend/package-lock.json` está commitado. Sem ele, Netlify usa `npm install` (não `npm ci`), que pode instalar versões diferentes.

### "Headers de segurança não aparecem"

Aplique via `curl -I https://meu-site.netlify.app`. Se não aparecerem:
1. Aguarde 1-2 min após o deploy (cache de CDN)
2. Faça um novo deploy (Settings → Trigger deploy → Clear cache and deploy)

### "PWA não instala"

Manifest precisa de ícones 192×192 e 512×512. Hoje o `vite.config.ts` usa `img/logo.jpg` (512×512). Para 192×192, adicione `frontend/public/pwa-192x192.png` e atualize o `vite.config.ts`.

---

## 🔗 Links úteis

- **Netlify dashboard**: https://app.netlify.com
- **Netlify docs — redirects**: https://docs.netlify.com/routing/redirects/
- **Netlify docs — headers**: https://docs.netlify.com/http/security-headers/
- **Netlify CLI**: https://docs.netlify.com/cli/get-started/
- **Build plugins**: https://docs.netlify.com/integrations/build-plugins/

---

## 📦 Estado atual do `frontend/dist/` após build

```
dist/
├── _headers              # 984 bytes (Netlify headers fallback)
├── _redirects            # 718 bytes (Netlify redirects fallback)
├── assets/
│   ├── index-Dqa0YZV-.css   37.27 kB (gzip 6.42 kB)
│   └── index-B_vcdmOF.js   424.66 kB (gzip 131.19 kB)
├── favicon.svg           400 bytes
├── img/                  # 7 imagens oficiais da marca
│   ├── agenda-aberta.jpg
│   ├── capa-trabalhamos.jpg
│   ├── cta-cuidado.jpg
│   ├── logo.jpg
│   ├── processo.jpg
│   ├── servicos.jpg
│   └── sobre-nasceu.jpg
├── index.html           1.66 kB
├── logo.jpg             31.51 kB (ícone PWA fallback)
├── manifest.webmanifest 347 bytes
├── registerSW.js        134 bytes
├── sw.js                1.22 kB (service worker)
└── workbox-9c191d2f.js  15.11 kB (workbox runtime)
```

Total: 7 entradas precache (~453 KiB) + assets com hash imutáveis.
