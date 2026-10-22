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
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  essencia-backend
```

Depois troque o host nos redirects do `netlify.toml`.

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
| `JWT_SECRET`             | `dev-secret-trocar`      | Chave de assinatura (**obrigatória trocar**) |
| `JWT_EXPIRES_IN`         | `7d`                     | Validade do token                  |
| `FRONTEND_URL`           | `http://localhost:5173`  | Origem permitida no CORS           |
| `NETLIFY_AI_URL`         | `https://netlify.ai`     | Webhook de notificação             |
| `NETLIFY_AI_TIMEOUT_MS`  | `5000`                   | Timeout do webhook                 |
| `MAX_UPLOAD_MB`          | `5`                      | Tamanho máximo de upload           |
| `UPLOAD_DIR`             | `./uploads`              | Pasta de uploads                   |

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