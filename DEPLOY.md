# 🚀 Guia de Deploy — Essência do Cuidar

O projeto é **monorepo** com duas aplicações:

| Camada    | Stack                            | Pode ir em serverless? | Recomendação             |
|-----------|----------------------------------|------------------------|--------------------------|
| Frontend  | Vite + React 18 (PWA estática)   | ✅ Sim                 | **Netlify**              |
| Backend   | Node 20 + Express + SQLite       | ❌ Não (stateful)      | **Render** / **Railway** |

---

## 🌐 Frontend → Netlify

### Opção A — Via dashboard (mais simples)
1. Conecte seu GitHub em https://app.netlify.com
2. **Add new site → Import existing project** → selecione `Nexus-HUB57/Essencia_do_Cuidar`
3. Netlify vai detectar `netlify.toml` automaticamente
4. Adicione variável de ambiente (Build environment):
   - `VITE_API_URL` = `https://<seu-backend>.onrender.com/api`
5. Deploy!

### Opção B — Via CLI
```bash
npm i -g netlify-cli
netlify login
netlify init       # detecta netlify.toml
netlify env:set VITE_API_URL https://<seu-backend>.onrender.com/api
netlify deploy --prod
```

> 💡 Se você ainda não subiu o backend, faça o deploy do frontend mesmo assim —
> a UI carrega, mas chamadas de API vão falhar graciosamente. Bom para preview visual.

---

## ⚙️ Backend → Render.com (recomendado, free tier)

### Via dashboard
1. https://dashboard.render.com → **New + → Web Service**
2. Conecte o repo `Nexus-HUB57/Essencia_do_Cuidar`
3. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Plan:** Free
4. **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=10000
   JWT_SECRET=<gere uma string aleatória de 64 chars>
   FRONTEND_URL=https://<seu-site>.netlify.app
   NETLIFY_AI_URL=https://netlify.ai
   ```
5. **Disks (avançado):** adicione um disco persistente de 1 GB montado em
   `/app/backend/data` se quiser preservar o SQLite entre deploys (opcional
   para demo — os dados recomeçam do seed a cada restart).
6. Deploy!

### Via `render.yaml` (infra-as-code)
Salve este arquivo como `render.yaml` na raiz e conecte via Blueprint:

```yaml
services:
  - type: web
    name: essencia-backend
    runtime: node
    rootDir: backend
    plan: free
    buildCommand: npm install
    startCommand: node src/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: FRONTEND_URL
        value: https://<seu-site>.netlify.app
      - key: NETLIFY_AI_URL
        value: https://netlify.ai
```

---

## 🐳 Alternativa: Docker em qualquer host

```bash
# Backend
cd backend
docker build -t essencia-backend .
docker run -p 4000:4000 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e FRONTEND_URL=https://<seu-frontend>.netlify.app \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  essencia-backend
```

Ou use `docker-compose.yml` (raiz) já configurado.

---

## 🔄 Full E2E com proxy via Netlify

Se você quiser que o frontend no Netlify converse com o backend **sem expor
a URL do backend no cliente**, descomente os redirects de proxy no
`netlify.toml`:

```toml
[[redirects]]
  from = "/api/*"
  to   = "https://<seu-backend>.onrender.com/api/:splat"
  status = 200
  force  = true
```

Aí o frontend não precisa da variável `VITE_API_URL` — ele usa `/api` que
vai pro backend via proxy.

---

## ✅ Checklist pós-deploy

- [ ] Healthcheck do backend: `curl https://<backend>/api/health` → `{"ok":true,...}`
- [ ] Frontend carrega: abrir `https://<site>.netlify.app` no navegador
- [ ] Login demo funciona: `maria@demo.com` / `demo1234`
- [ ] Cadastro de novo profissional dispara webhook (verificar logs do backend)
- [ ] Chat funciona entre dois navegadores logados
- [ ] PWA instalável: no Chrome mobile, abrir menu → "Instalar app"

---

## 🛠️ Variáveis de ambiente

### Frontend (build-time)
| Var             | Default | Descrição                              |
|-----------------|---------|----------------------------------------|
| `VITE_API_URL`  | `/api`  | URL absoluta do backend (sem trailing /api) ou path relativo |

### Backend
| Var                | Default                  | Descrição                                |
|--------------------|--------------------------|------------------------------------------|
| `PORT`             | `4000`                   | Porta do servidor                        |
| `NODE_ENV`         | `development`            | Modo                                     |
| `JWT_SECRET`       | `dev-secret-trocar`      | Chave de assinatura JWT (**trocar em prod**) |
| `JWT_EXPIRES_IN`   | `7d`                     | Validade do token                        |
| `FRONTEND_URL`     | `http://localhost:5173`  | Origem do frontend (CORS)                |
| `NETLIFY_AI_URL`   | `https://netlify.ai`     | Webhook de notificação                   |
| `NETLIFY_AI_TIMEOUT_MS` | `5000`              | Timeout do webhook                       |
| `MAX_UPLOAD_MB`    | `5`                      | Tamanho máximo de upload                 |
| `UPLOAD_DIR`       | `./uploads`              | Pasta de uploads                         |
