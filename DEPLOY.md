# 🚀 Guia de Deploy — Essência do Cuidar

## Como a sincronização funciona

```
  git push (main)
        │
        ├──► GitHub  (repo Nexus-HUB57/Essencia_do_Cuidar)
        │              └─ netlify.toml detecta a config
        │
        └──► Netlify  (build automático: npm ci && npm run build)
                       └─ publica frontend/dist
                                 │
                                 └──► redirects /api, /uploads, /socket.io
                                        encaminham pro backend (Render/Railway)

  Render/Railway  (backend Node + SQLite, stateful — roda separado)
```

Cada `git push` na branch `main` republica o site. Não é preciso deploy manual.

---

## ⚙️ Setup único (uma vez só)

### 1. Conectar o repo na Netlify

1. https://app.netlify.com → **Add new site** → **Import an existing project**
2. Selecione `Nexus-HUB57/Essencia_do_Cuidar`
3. A Netlify lê o `netlify.toml` da raiz e preenche sozinha:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Deploy site** (esse primeiro build pode falhar no proxy — tudo bem, o frontend sobe)

### 2. Subir o backend (Render.com, free)

1. https://dashboard.render.com → **New +** → **Web Service**
2. Conecte o mesmo repo
3. Configure:

| Campo            | Valor                     |
|------------------|---------------------------|
| Root Directory   | `backend`                 |
| Runtime          | Node                      |
| Build Command    | `npm install`             |
| Start Command    | `node src/index.js`       |
| Plan             | Free                      |

4. **Environment Variables** (todas):

```
NODE_ENV         = production
PORT             = 10000
JWT_SECRET       = <gere: openssl rand -hex 32>
JWT_EXPIRES_IN   = 7d
FRONTEND_URL     = https://<seu-site>.netlify.app
NETLIFY_AI_URL   = https://netlify.ai
UPLOAD_DIR       = ./uploads
MAX_UPLOAD_MB    = 5
```

5. Deploy. Anote a URL: `https://essencia-backend.onrender.com`

> ⚠️ **Free tier do Render dorme.** A primeira request pode demorar ~50s.
> Pra production use o plano pago (sempre ligado).

> ⚠️ **Confirme que o serviço subiu a API certa.** O Render responde 404 em
> qualquer rota se o build não tiver montageado as rotas (deploy de branch
> errada, `rootDir` incorreto, ou serviço placeholder). Cheque:
>
> ```bash
> curl -s https://<seu-backend>/api/health
> # esperado: {"ok":true,"service":"essencia-do-cuidar",...}
> ```
>
> Se vier `Cannot GET /api/health` (HTML), o host existe mas **não está
> servindo esta API** — o proxy da Netlify vai repassar esse 404 para o
> navegador. O `scripts/netlify-pre-deploy-check.sh` distingue os dois
> casos: 502/504 é backend dormindo; 404 com corpo HTML é configuração
> errada.

### 3. Apontar o proxy pro backend

Abra `netlify.toml` na raiz do repo e troque `essencia-backend.onrender.com`
pelo host real do seu backend nas 3 regras de redirect. Commit + push.

### 4. (Opcional) Automatizar via GitHub Actions

O repo já tem `.github/workflows/deploy-netlify.yml`. Pra ativar:

1. Gere um token: https://app.netlify.com/user/tokens → **Personal access token**
2. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - `NETLIFY_AUTH_TOKEN` = o token do passo 1
   - `NETLIFY_SITE_ID` = em Netlify: Site settings → General → API ID
3. (Opcional) `Settings → Secrets → New repository variable`:
   - `VITE_API_URL` = `/api`

Agora cada push mostra o deploy no GitHub em **Actions** e gera comentário com o resumo.

---

## 🔍 Checklist pós-deploy

```bash
# 1. Frontend no ar
curl -I https://<seu-site>.netlify.app

# 2. Imagens da marca
for i in logo capa-trabalhamos sobre-nasceu servicos processo agenda-aberta cta-cuidado; do
  curl -o /dev/null -w "$i.jpg → %{http_code}\n" https://<seu-site>.netlify.app/img/$i.jpg
done

# 3. PWA
curl -o /dev/null -w "manifest → %{http_code}\n" https://<seu-site>.netlify.app/manifest.webmanifest
curl -o /dev/null -w "sw.js   → %{http_code}\n" https://<seu-site>.netlify.app/sw.js

# 4. API através do proxy
curl https://<seu-site>.netlify.app/api/health
# esperado: {"ok":true,"service":"essencia-do-cuidar",...}
```

Depois no navegador:
- [ ] Landing abre com as 7 imagens da Essência
- [ ] Botão flutuante do WhatsApp abre `wa.me/5519988322428`
- [ ] Login demo: `maria@demo.com` / `demo1234`
- [ ] Cadastro wizard profissional funciona
- [ ] Chat entre dois navegadores
- [ ] PWA instalável (Chrome mobile → menu → "Instalar app")

---

## 🐳 Alternativa: Docker em qualquer host

```bash
cd backend
docker build -t essencia-backend .
docker run -d --name essencia -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e FRONTEND_URL=https://<seu-site>.netlify.app \
  -e AUTH_UPLOADS=true \
  -e AUTO_CLOSE_ON_ACCEPT=true \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  essencia-backend
```

Depois troque o host nos redirects do `netlify.toml`.

---

## 🚀 Novas opções de deploy (PR #19)

### Render Blueprint (recomendado para MVP)

O arquivo `render.yaml` na raiz do repo é detectado automaticamente pelo Render
quando você cria um Blueprint:

1. https://dashboard.render.com → New → Blueprint
2. Conecte o repo `Nexus-HUB57/Essencia_do_Cuidar`
3. Render lê `render.yaml` e cria:
   - 1 Web Service (`essencia-backend`)
   - 2 Cron Jobs (`essencia-webhook-retry` a cada 30min, `essencia-candidatura-cleanup` diário às 3h)
4. Configure as env vars sensíveis no painel:
   - `JWT_SECRET` (sync: false no render.yaml → você precisa digitar no painel)
   - `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` (se Stripe live)
   - `DATABASE_URL` (se PostgreSQL)
5. Deploy

### Kubernetes (recomendado para escala)

O arquivo `k8s/manifests.yaml` contém tudo:
- Namespace `essencia`
- Deployment (2 réplicas + HPA 2-10 por CPU/memória)
- Service (ClusterIP)
- 2 PersistentVolumeClaims (data + uploads)
- 2 CronJobs (webhook retry + cleanup)
- Ingress com TLS

```bash
# 1. Criar secret com credenciais
kubectl create secret generic essencia-secrets \
  --namespace=essencia \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
  --from-literal=STRIPE_SECRET_KEY=sk_live_xxx \
  --from-literal=STRIPE_WEBHOOK_SECRET=whsec_xxx

# 2. Aplicar manifests
kubectl apply -f k8s/manifests.yaml

# 3. Verificar
kubectl get pods -n essencia
kubectl get cronjobs -n essencia
kubectl get ingress -n essencia
```

### Cron jobs via host crontab (qualquer host)

Para VPS/EC2/DigitalOcean sem cron externo, use os scripts shell:

```bash
# Editar crontab
crontab -e

# Adicionar (precisa de BACKEND_URL e ADMIN_TOKEN no env):
BACKEND_URL=https://api.seu-site.com
ADMIN_TOKEN=$(curl -s -X POST $BACKEND_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","senha":"admin1234"}' | jq -r .token)

# Webhook retry a cada 30min
*/30 * * * * BACKEND_URL=$BACKEND_URL ADMIN_TOKEN=$ADMIN_TOKEN \
  /path/to/Essencia_do_Cuidar/scripts/cron-webhook-retry.sh >> /var/log/essencia-cron.log 2>&1

# Candidatura cleanup diário às 3h
0 3 * * * BACKEND_URL=$BACKEND_URL ADMIN_TOKEN=$ADMIN_TOKEN \
  /path/to/Essencia_do_Cuidar/scripts/cron-candidatura-cleanup.sh >> /var/log/essencia-cron.log 2>&1
```

### Cron jobs internos (single-instance, opt-in)

Para ambientes sem cron externo (ex.: Render free tier sem Cron Jobs),
ative os cron jobs internos no próprio processo do backend:

```bash
ENABLE_INTERNAL_CRON=true
```

⚠️ **NÃO usar em multi-instância** — cada instância rodaria os jobs em paralelo, duplicando work.

---

## 📈 Monitoramento + Alertas (PR #19)

### Healthcheck

```bash
# Monitor externo (UptimeRobot / Render / k8s probe) chama:
GET https://api.seu-site.com/api/health
# 200 → ok
# 503 → DB caiu (dispara alerta 'db_down' automaticamente)
```

### Webhook health (24h)

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.seu-site.com/api/admin/webhooks/health

# Retorna: status (healthy/warning/critical), total, taxa_falha,
# por_status, por_tipo, ultimos_erros
```

### Alertas

```bash
# Ver alertas recentes:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.seu-site.com/api/admin/alerts

# Disparar alerta de teste (valida integração Slack):
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.seu-site.com/api/admin/alerts/test
```

### Integração com Slack

Configure `SLACK_WEBHOOK_URL` no env (formato: `https://hooks.slack.com/services/T.../B.../...`):

```bash
SLACK_WEBHOOK_URL=<cole-a-url-do-seu-incoming-webhook-aqui>
```

Quando um alerta é emitido (503 do DB, etc), é enviado para o canal Slack configurado.
Throttle de 5min por tipo (não spamma).

### OpenAPI/Swagger UI

Acesse no navegador:
```
https://api.seu-site.com/api/docs
```

Para importar em Postman/Insomnia:
```
https://api.seu-site.com/api/openapi.json
```

---

## 🔧 Variáveis de ambiente

### Frontend (build-time ⚠️)

| Variável       | Default | Descrição                                            |
|----------------|---------|------------------------------------------------------|
| `VITE_API_URL` | `/api`  | Path relativo (usa proxy) ou URL absoluta do backend |

> Variável `VITE_*` é **embutida no bundle durante o build**. Mudar a variável
> exige novo deploy — não basta reiniciar.

### Backend (runtime)

| Variável                 | Default                  | Descrição                          |
|--------------------------|--------------------------|------------------------------------|
| `PORT`                   | `4000`                   | Porta do servidor                  |
| `NODE_ENV`               | `development`            | Modo                               |
| `JWT_SECRET`             | `dev-secret-trocar`      | Chave de assinatura (**obrigatória em produção**) |
| `JWT_EXPIRES_IN`         | `7d`                     | Validade do token (legado, sem refresh) |
| `JWT_ACCESS_EXPIRES`     | `15m`                    | A1 — validade do access token (curto) |
| `JWT_REFRESH_EXPIRES`    | `7d`                     | A1 — validade do refresh token (longo) |
| `ENABLE_REFRESH_TOKENS`  | `false`                  | A1 — ativa refresh tokens no login |
| `FRONTEND_URL`           | `http://localhost:5173`  | Origem permitida no CORS           |
| `NETLIFY_AI_URL`         | `https://netlify.ai`     | Webhook de notificação             |
| `NETLIFY_AI_TIMEOUT_MS`  | `5000`                   | Timeout do webhook                 |
| `MAX_UPLOAD_MB`          | `5`                      | Tamanho máximo de upload           |
| `UPLOAD_DIR`             | `./uploads`              | Pasta de uploads                   |
| `AUTH_UPLOADS`           | `true`                   | U3 — `/uploads/` requer auth       |
| `AUTO_CLOSE_ON_ACCEPT`   | `true`                   | M7 — auto-close vaga após aceite  |
| `MAX_CANDIDATURAS_PER_VAGA` | `50`                  | M8 — limite de candidaturas por vaga |
| `CANDIDATURA_EXPIRA_DIAS` | `30`                     | M9 — dias para expirar candidatura pendente |
| `RATE_LIMIT_MAX`         | `300`                    | P9 — limite de requests por user/IP |
| `RATE_AUTH_MAX`          | `30`                     | P9 — limite de requests em /api/auth/* |
| `ENABLE_INTERNAL_CRON`   | `false`                  | Item 3 — ativa cron jobs internos (single-instance) |
| `SLACK_WEBHOOK_URL`      | (vazio)                  | Item 10 — URL do webhook do Slack para alertas |
| `STRIPE_SECRET_KEY`      | (vazio)                  | Stripe live key (se ausente, modo mock) |
| `STRIPE_WEBHOOK_SECRET`  | (vazio)                  | P1 — secret para validar assinatura do webhook Stripe |
| `STRIPE_MOCK`            | `true`                   | Modo demo (sem chamada real à Stripe) |
| `PLATFORM_FEE_PCT`       | `10`                     | Taxa da plataforma (split 90/10)   |
| `VAPID_PUBLIC_KEY`       | (vazio)                  | Feature 4 — Web Push (no-op se ausente) |
| `VAPID_PRIVATE_KEY`      | (vazio)                  | Feature 4 — Web Push (no-op se ausente) |
| `VAPID_SUBJECT`          | `mailto:admin@...`       | Feature 4 — Web Push               |
| `DATABASE_URL`           | (vazio)                  | Se ausente, usa SQLite em ./data   |
| `PGSSL`                  | (vazio)                  | `true` se servidor PG exigir SSL   |
| `BACKEND_URL`            | `http://localhost:4000`  | P10 — URL base para OpenAPI spec   |
| `MERCADOPAGO_ACCESS_TOKEN` | (vazio)                | Custódia (PDC) — Pix via API MP (se ausente, mock) |
| `MERCADOPAGO_WEBHOOK_URL`  | (vazio)                | URL pública que o MP chama de volta |
| `MERCADOPAGO_LINK_ENF_12H` | (vazio)                | Plantões — link-id do MP p/ enfermagem 12h |
| `MERCADOPAGO_LINK_ENF_8H`  | (vazio)                | Plantões — link-id do MP p/ enfermagem 8h  |
| `MERCADOPAGO_LINK_ENF_6H`  | (vazio)                | Plantões — link-id do MP p/ enfermagem 6h  |
| `MERCADOPAGO_LINK_CUI_12H` | (vazio)                | Plantões — link-id do MP p/ cuidador 12h   |
| `MERCADOPAGO_LINK_CUI_8H`  | (vazio)                | Plantões — link-id do MP p/ cuidador 8h    |
| `MERCADOPAGO_LINK_CUI_6H`  | (vazio)                | Plantões — link-id do MP p/ cuidador 6h    |

### 💼 Plantões avulsos via Payment Link (Mercado Pago)

A página `/plantoes` vende 6 plantões fixos por Payment Link do Mercado
Pago. Sem env config o fluxo funciona com **ids de demonstração** — bom
para dev/teste, mas **em produção configure os 6 link-ids reais** criados
no painel do MP (Criar link de pagamento → one-time → preço publicado).

1. Crie os 6 links no painel do MP com os preços do catálogo
   (`backend/src/services/mercadopago-links.js`): enfermagem
   12/8/6h = R$ 250/200/150, cuidador 12/8/6h = R$ 200/180/120.
2. Copie o **link-id** de cada um (é o valor `link-id` que aparece na URL
   de redirect `mpago.la/...` → `/payment-link/v1/redirect?link-id=XXX`)
   e coloque nas env vars `MERCADOPAGO_LINK_*` acima.
3. No painel do MP, configure a **URL de notificação (webhook)** da conta
   para `https://<seu-backend>/api/webhooks/mercadopago`. Payment Links não
   levam `notification_url` na query — e o MP recusa `notification_url`
   apontando para host não público.
4. Não use o short link `mpago.la` no código: ele responde 301 e **descarta
   a query string**, perdendo a `external_reference` que o backend usa para
   reconciliar o pagamento. O catálogo monta sempre a URL de redirect
   oficial, que preserva.

Sem essas env vars o checkout aponta para `DEMO-*` — o checkout real do MP
não vai existir; útil só para demonstrar o fluxo.

---

## 🪟 Sobre os deploys temporários do sandbox

Deploys feitos pelo ambiente de sandbox geram URLs em
`*.space.minimax.io` que são **efêmeras** — expiram e deixam de resolver.
Para URL permanente use Netlify + Render conforme acima.

---

## 🚑 Troubleshooting

**Sitemap mostra site em branco**
`netlify.toml` tem `base = "frontend"`. Confirme que o publish directory
no painel da Netlify é `dist` (não `frontend/dist`).

**API retorna 404 no site**
Os redirects de proxy estão **depois** do catch-all? Não. A ordem no
`netlify.toml` importa: proxy primeiro, `/*` → index.html por último.

**API retorna HTML em vez de JSON**
O catch-all `/*` está pegando `/api/*`. Causa: regras na ordem errada
ou `force = false` nos redirects de proxy.

**Chat não conecta (WebSocket)**
O redirect de `/socket.io/*` precisa existir **e** ter `force = true`.

**Imagens não aparecem**
Confirme que `frontend/public/img/*.jpg` foi commitado (`.gitignore`
não deve ignorar `public/`). Cheque: `git ls-files frontend/public/img`

**Backend dorme depois de 15min (Render free)**
Esperado no free tier. Para evitar: plano pago, ou adicione um cron
externo que pingue `/api/health` a cada 10 min.