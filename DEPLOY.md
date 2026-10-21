# 🚀 Guia de Deploy — Essência do Cuidar

O projeto é **monorepo** com duas aplicações:

| Camada    | Stack                            | Pode ir em serverless? | Recomendação             |
|-----------|----------------------------------|------------------------|--------------------------|
| Frontend  | Vite + React 18 (PWA estática)   | ✅ Sim                 | **Netlify**              |
| Backend   | Node 20 + Express                | ✅ (com Postgres)      | **Render** / **Railway** |

> **Nota (branch `feat/6-features`):** o backend agora usa um driver de banco
> unificado. Sem `DATABASE_URL` roda em SQLite (dev); com `DATABASE_URL` roda em
> PostgreSQL (produção). Isso torna o backend **stateless** — ideal para serverless.

---

## 🐳 Opção 0 — Docker Compose (recomendado para VPS / staging)

Três formas de subir, da mais simples pra mais completa:

### 0a. Dev simples (SQLite, sem banco externo)

```bash
cp .env.example .env   # ajuste JWT_SECRET se quiser
docker compose up
# frontend: http://localhost:5173
# backend:  http://localhost:4000
```

### 0b. Produção completa (PostgreSQL + backend + nginx)

```bash
cp .env.example .env
# Edite .env: POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up -d
# Acesse: http://localhost
```

O `docker-compose.prod.yml` já sobe o Postgres, roda a migration
(`node scripts/migrate-pg.js`) automaticamente no start do backend, e o nginx
faz proxy de `/api` + `/socket.io` para o backend — tudo em uma porta só.

### 0c. Render/Railway/fly.io com Postgres gerenciado

Use o `render.yaml` da raiz (Blueprint) — veja a seção Render abaixo. Em
plataformas que dão Postgres gerenciado, aponte `DATABASE_URL` para lá e o
backend vira 100% serverless (sem disco persistente).

---

## ⚙️ Alternativa: Docker em qualquer host (manual)

```bash
# Backend
cd backend
docker build -t essencia-backend .
docker run -p 4000:4000 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e FRONTEND_URL=https://<seu-frontend>.netlify.app \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  essencia-backend

# Frontend
cd ../frontend
docker build -t essencia-frontend --build-arg VITE_API_URL=/api .
docker run -p 5173:80 essencia-frontend
```

---

## 🧬 Banco de dados

| Ambiente   | `DATABASE_URL` | Driver   | Como rodar migration          |
|------------|----------------|----------|-------------------------------|
| Dev local  | (vazio)        | SQLite   | automático (cria schema)      |
| Postgres   | `postgres://…` | Postgres | `npm run migrate:pg`          |
| Docker prod| (injetado)     | Postgres | automático no start           |

```bash
# Migrar schema para Postgres
DATABASE_URL=postgres://user:pass@host:5432/db npm run migrate:pg
```

O mesmo schema (tabelas, colunas, índices, CHECKs) roda nos dois drivers — o
`src/db/driver.js` escolhe o backend e converte placeholders (`?` ↔ `$1`).

---

## 💳 Stripe Connect (feature 3)

Por padrão roda em **modo mock** (`STRIPE_MOCK=true`): nada é cobrado de verdade,
os fluxos de onboarding e Pix são simulados. Para ativar o live:

1. Crie uma conta em https://dashboard.stripe.com (Brasil)
2. Ative o **Connect** (marketplace)
3. Pegue a `STRIPE_SECRET_KEY` (sk_live_… ou sk_test_…)
4. No `.env` / painel do host:
   ```
   STRIPE_MOCK=false
   STRIPE_SECRET_KEY=sk_…
   PLATFORM_FEE_PCT=10     # % que fica com a plataforma
   ```
5. No frontend, cada profissional conecta sua conta via
   **Dashboard Profissional → "Conectar conta de pagamento (Stripe)"**

---

## 🔔 Web Push / VAPID (feature 4)

```bash
cd backend
npx web-push generate-vapid-keys
# → Anote VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY
```

Adicione no `.env`:
```
VAPID_PUBLIC_KEY=<public>
VAPID_PRIVATE_KEY=<private>
VAPID_SUBJECT=mailto:admin@essencia-do-cuidar.app
```

Sem essas chaves, o módulo roda em no-op (não quebra, só não notifica).
Com elas, o botão "🔔 Ativar notificações push" aparece na navbar.

---

## 🛡️ Painel administrativo (feature 5)

Acesso: `POST /api/auth/login` com uma conta `is_admin=1`. A conta de demo:
```
admin@demo.com / admin1234
```

- Frontend: rota `/admin` (aparece no menu só para admins)
- Backend: todos os endpoints sob `/api/admin/*` exigem `is_admin=1` (403 caso contrário)
- Para promover alguém: `POST /api/admin/users/:id/admin { is_admin: true }` ou direto no banco

---

## 🌍 Internacionalização (feature 6)

Frontend: `react-i18next` com detecção automática de idioma
(`localStorage → navigator → <html lang>`). Chave de persistência: `essencia_lang`.

Backend: dicionários em `src/i18n/dictionaries.js`, expostos em
`GET /api/i18n/:locale` (`pt-BR`, `es`, `en`) para o frontend sincronizar se quiser.

---

## 📋 Variáveis de ambiente — referência rápida

### Frontend (build-time)
| Var             | Default | Descrição                              |
|-----------------|---------|----------------------------------------|
| `VITE_API_URL`  | `/api`  | URL da API (relativo ou absoluto)      |

### Backend (runtime)
| Var                    | Default                 | Descrição                              |
|------------------------|-------------------------|----------------------------------------|
| `PORT`                 | `4000`                  | Porta do servidor                      |
| `DATABASE_URL`         | (vazio → SQLite)        | Conexão Postgres (produção)            |
| `PGSSL`                | `false`                 | `true` se o Postgres exigir SSL        |
| `JWT_SECRET`           | ⚠️ insecure dev         | Chave de assinatura (64+ chars em prod)|
| `FRONTEND_URL`         | `http://localhost:5173` | Origem do CORS (CSV para várias)       |
| `NETLIFY_AI_URL`       | `https://netlify.ai`    | Webhook de notificação                 |
| `MAX_UPLOAD_MB`        | `5`                     | Tamanho máximo de upload               |
| `UPLOAD_DIR`           | `./uploads`             | Pasta de uploads                       |
| `STRIPE_MOCK`          | `true`                  | `false` para ativar Stripe live        |
| `PLATFORM_FEE_PCT`     | `10`                    | % da plataforma sobre cada pagamento  |
| `VAPID_PUBLIC_KEY`     | (vazio)                 | Chave pública VAPID (web push)         |
| `VAPID_PRIVATE_KEY`    | (vazio)                 | Chave privada VAPID                    |

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
4. **Environment Variables:** veja a tabela acima
5. **Disks (opcional):** adicione um disco persistente montado em
   `/app/backend/data` se estiver usando SQLite. Com `DATABASE_URL` (Postgres
   gerenciado do Render), você não precisa de disco — o backend fica stateless.
6. Deploy!

### Via `render.yaml` (infra-as-code)
O `render.yaml` na raiz já está pronto — conecte via **Blueprints** e ele cria
o serviço com healthcheck, disco e todas as variáveis.

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

- [ ] Healthcheck do backend: `curl https://<backend>/api/health` → `{"ok":true,"db":"postgres"}`
- [ ] Frontend carrega: abrir `https://<site>.netlify.app` no navegador
- [ ] Login demo funciona: `maria@demo.com` / `demo1234`
- [ ] Admin funciona: `admin@demo.com` / `admin1234` → rota `/admin`
- [ ] Cadastro de novo profissional dispara webhook (verificar logs do backend)
- [ ] Chat funciona entre dois navegadores logados
- [ ] PWA instalável: no Chrome mobile, abrir menu → "Instalar app"
- [ ] Seletor de idioma funciona (navbar, 3 opções)
- [ ] Botão de pagamento Pix aparece em candidato aceito (contratante)

---

## 🧪 Rodar os testes E2E

```bash
# Backend no ar em :4000
BASE=http://localhost:4000 bash scripts/smoke-test.sh     # 15 cenários (MVP)
BASE=http://localhost:4000 bash scripts/smoke-test-v2.sh  # 28 cenários (6 features)
```