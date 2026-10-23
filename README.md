# Essência do Cuidar

> Marketplace de profissionais de saúde para atendimento domiciliar de idosos e pacientes
> de **baixa e média complexidade**. Aplicação **full-stack** com frontend React PWA, backend
> Node.js + SQLite/PostgreSQL e integração de webhook.

![Status](https://img.shields.io/badge/status-MVP-blue) ![Stack](https://img.shields.io/badge/stack-React%20%2B%20Node%20%2B%20SQLite-emerald) ![Commits](https://img.shields.io/badge/commits-42-brightgreen)

---

## 🆕 Recursos novos (PR #17, #18, #19)

Esta versão foi construída sobre o trabalho recuperado de branches perdidas e
expandida com 4 Sprints de melhorias + 12 itens de robustez pós-merge.

### Sistema de Matching Automático (Sprint 1)
- **Algoritmo de score 0-1** (services/matching.js) com 5 componentes:
  tipo de profissional (0.40), disponibilidade vs jornada (0.20),
  boost por `registro_verificado` (0.15), boost por avaliação média (0.15),
  boost por região definida (0.05)
- `GET /api/vagas/:id/recomendar` — top N profissionais recomendados para uma vaga
- `GET /api/profissionais/me/recomendar` — top N vagas recomendadas para o profissional logado
- Exclui recursos já relacionados (não recomenda duplicar)

### Eventos Socket.IO em tempo real (Sprint 2)
- 7 eventos: `candidatura:visualizada/aceita/recusada`, `vaga:fechada/pausada/reativada`, `mensagem:nova`
- Hook React `useMatchingEvents` (frontend/src/hooks/) persiste eventos em localStorage
- Notifica favoritadores + candidatos pendentes automaticamente
- Web Push (VAPID) como fallback para usuários offline

### Auditoria de transições (Sprint 2 — M11)
- Tabela `candidatura_status_log` registra todas as mudanças de status
  (null → pendente → visualizada → aceita|recusada)
- `GET /api/candidaturas/:id/historico-status` — histórico completo com nome do alterador
- Restrito ao profissional dono OU contratante da vaga OU admin

### Robustez operacional (Sprint 3)
- **M2/M3** — 8 profissões canônicas + 27 UFs (services/profissoes.js)
  + `GET /api/profissoes` para o frontend + warning retrocompatível
- **M3** — coluna `vagas.regiao_uf` + validação + filtro `?regiaoUf=SP`
- **M8** — limite de candidaturas por vaga (env `MAX_CANDIDATURAS_PER_VAGA`, default 50)
- **M9** — expiração automática de candidaturas pendentes há +30 dias
  via `POST /api/admin/candidaturas/limpar-expiradas`

### Auth avançada (Sprint 3 — A1/A2)
- **A1** — Refresh token (env `ENABLE_REFRESH_TOKENS=true` opt-in)
  Access token curto (15min) + refresh token longo (7d)
  `POST /api/auth/refresh` para renovar access
- **A2** — Revogação de token JWT via `jti` blacklist
  Tabela `token_blacklist` criada automaticamente no boot
  `POST /api/auth/logout` revoga token atual
- Todos os tokens agora têm `jti` único para permitir revogação

### Uploads com auth (Sprint 3 — U3)
- `/uploads/` agora requer autenticacao (`AUTH_UPLOADS=true` default)
- Profissional só vê próprios diplomas (filename `prof<id>_*`)
- Contratante só vê diplomas de candidatos das suas vagas
- Admin pode ver qualquer arquivo
- Anti path traversal + 404 para arquivo inexistente (não vaza info)

### OpenAPI/Swagger (Sprint 3 — P10)
- `GET /api/openapi.json` — JSON OpenAPI 3.0 spec (14+ endpoints)
- `GET /api/docs` — Swagger UI interativo (HTML via CDN, sem deps extras)
- Importe em Postman/Insomnia/Swagger Editor

### Deploy configs (12 itens pós-merge)
- **render.yaml** — Render Blueprint (1 Web Service + 2 Cron Jobs automáticos)
- **k8s/manifests.yaml** (300+ linhas) — Deployment, HPA, 2 PVCs, 2 CronJobs, Ingress TLS
- **Dockerfile multi-stage** — Stage 1 compila better-sqlite3, Stage 2 runtime menor
- **scripts/cron-*.sh** — Para host crontab (webhook retry + cleanup)
- **services/cron-internal.js** — Cron interno via `setInterval` (ENABLE_INTERNAL_CRON opt-in)

### Alerting + Monitoring (12 itens pós-merge)
- `services/alerting.js` — emite alertas JSON estruturado (Loki/Datadog compat)
- Integração no `/api/health` — 503 dispara alerta `db_down`
- Persiste em `data/alerts.log` + envia para Slack se `SLACK_WEBHOOK_URL` setada
- Throttle 5min por tipo (não spamma)
- `GET /api/admin/alerts` — lista alertas recentes (default 50, max 200)
- `POST /api/admin/alerts/test` — dispara alerta de teste
- `GET /api/admin/webhooks/health` — stats de webhooks últimas 24h
  (status healthy/warning/critical + por_status + por_tipo + taxa_falha)

### Busca textual FTS (12 itens pós-merge — M10)
- `services/search-fts.js` — FTS5 SQLite (tabela virtual + triggers)
  + tsvector PostgreSQL (índice GIN)
- `GET /api/vagas/buscar?q=<texto>&limite=20&offset=0`
- Tokenizer `unicode61 remove_diacritics 2` (acentos ignorados)
- Fallback para LIKE se FTS indisponível (banco antigo sem migration)

### Variáveis de ambiente novas (Sprint 1-3 + 12 itens)
```bash
# Segurança crítica (P2)
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 32>  # OBRIGATÓRIO em produção
# Stripe live (P1)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Refresh tokens opt-in (A1)
ENABLE_REFRESH_TOKENS=false
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
# Rate limit por user (P9)
RATE_LIMIT_MAX=300
RATE_AUTH_MAX=30
# Uploads com auth (U3)
AUTH_UPLOADS=true
# Cron interno (single-instance)
ENABLE_INTERNAL_CRON=false
# Alerting
SLACK_WEBHOOK_URL=
# Matching (M7)
AUTO_CLOSE_ON_ACCEPT=true
# Robustez (M8/M9)
MAX_CANDIDATURAS_PER_VAGA=50
CANDIDATURA_EXPIRA_DIAS=30
# OpenAPI spec
BACKEND_URL=https://seu-backend.com
```

---

## 🌟 Visão Geral

Plataforma que conecta **famílias e clínicas** (+Saúde) a **profissionais de saúde
verificados** (cuidadores, enfermeiros, fisioterapeutas, psicólogos, nutricionistas,
médicos) para cuidado domiciliar com confiança, empatia e segurança.

### Identidade visual
- **Azul Serenidade** `#4A90E2` — confiança e acolhimento
- **Verde Esmeralda** `#50E3C2` — saúde e vitalidade
- **Branco** — limpeza visual
- **Fontes** Inter (texto) + Poppins (títulos)

### Funcionalidades principais
- ✅ **Landing page** com identidade visual, "Como funciona" e CTAs
- ✅ **Cadastro em wizard multi-step** para Profissional e +Saúde
- ✅ **Login com JWT** (Bearer token, 7 dias de validade default, refresh opt-in)
- ✅ **Dashboard do Profissional**: buscar vagas, filtros, candidatar-se, perfil, chat
- ✅ **Dashboard do +Saúde**: publicar vaga, gerenciar candidatos, aceitar/recusar, chat
- ✅ **Listagem pública de vagas** com filtros (10 filtros + paginação + ordenação)
- ✅ **Chat interno** tempo real (Socket.IO) com fallback HTTP — sem echo ao remetente (W1)
- ✅ **Upload de diploma** (PDF/JPG/PNG, 5 MB) com selo de verificação + auth U3
- ✅ **Validação estrutural de registros** (CRM, COREN, CREFITO, CRP, CRN) com 3 estados
- ✅ **Matching automático** — score 0-1 com 5 componentes (M1) + 2 endpoints de recomendação
- ✅ **Eventos Socket.IO em tempo real** (7 eventos) + Web Push + hook React (W4, W5)
- ✅ **Auditoria de transições** de status em `candidatura_status_log` (M11)
- ✅ **Limite de candidaturas por vaga** (M8) + **expiração automática** (M9)
- ✅ **Webhook de notificação** para `https://netlify.ai` em cada vaga criada e candidatura + retry (N1)
- ✅ **PWA** instalável (manifest, service worker via vite-plugin-pwa)
- ✅ **Mobile-first** (testado em viewport pequeno)
- ✅ **Internacionalização** (pt-BR, es, en) com switcher
- ✅ **OpenAPI/Swagger docs** em `/api/docs` (P10)
- ✅ **Alertas 503 + Slack** + monitoramento de webhooks (Item 10)
- ✅ **Busca textual FTS5/tsvector** (M10)
- ⚠️ **Não aceita** vagas de alta complexidade/UTI (regra de negócio)

---

## 🛡️ Verificação de registros (3 estados)

> ℹ️ Nenhum conselho profissional brasileiro (CRM, COREN, CREFITO, CRP, CRN) expõe API
> pública oficial para consulta de registros. Por isso adotamos **verificação estrutural**
> via regex por conselho + auditoria, deixando a integração com APIs oficiais como ponto
> de extensão futuro (ver `backend/src/services/registroValidator.js` → `verifyWithCouncil`).

A coluna `registro_verificado` na tabela `profissionais_detalhes` tem **3 estados**:

| Estado | Significado                              | Selo na UI              |
|--------|------------------------------------------|-------------------------|
| `0`    | Não validado (default)                   | cinza: "Não validado"   |
| `1`    | Validado estruturalmente (regex passou)  | verde: "✓ Verificado"   |
| `2`    | Pendente de análise manual / formato inválido | amarelo: "⏳ Em análise" |

A validação roda no endpoint `POST /api/profissionais/me/verificar-registro`
(profissional autenticado). O resultado é gravado em `webhook_logs` (tipo
`registro_verificacao`) para auditoria. Formatos aceitos:

| Conselho | Regex (núcleo)                    | Exemplo               |
|----------|-----------------------------------|-----------------------|
| COREN    | `^COREN[- ]?UF[- ]?\d{4,6}$`       | `COREN-SP 123456`     |
| CRM      | `^\d{4,6}[/- ]UF$`                 | `123456/SP`           |
| CREFITO  | `^CREFITO[- ]?\d{4,6}[- ]?[A-Z]$`  | `CREFITO-12345-F`     |
| CRP      | `^\d{2}[/- ]\d{4,5}$`              | `06/12345`            |
| CRN      | `^\d{4,6}[/- ]UF$`                 | `12345/RJ`            |

> A confirmação final continua sendo responsabilidade do contratante — o selo é um
> sinal de **boa-fé estrutural**, não uma garantia KYC.

---

## 🏗️ Arquitetura

```
Essencia_do_Cuidar/
├── backend/                    # API Node.js + Express + SQLite/Postgres + Socket.IO
│   ├── src/
│   │   ├── index.js            # Bootstrap do servidor + Socket.IO + inicialização de módulos
│   │   ├── db/                 # driver.js (sqlite+pg) + sqlite.js + postgres.js + index.js (facade)
│   │   ├── routes/             # auth, profissionais, vagas, candidaturas, mensagens, avaliacoes,
│   │   │                       # favoritos, notificacoes, pagamentos, push, admin, i18n
│   │   ├── middleware/         # auth (JWT+jti+blacklist), validate (schema), security (helmet+rate-limit)
│   │   └── services/
│   │       ├── netlify.js          # Cliente do webhook netlify.ai
│   │       ├── registroValidator.js # Verificação estrutural de registros (regex)
│   │       ├── matching.js         # M1 — algoritmo de score de matching (322 linhas)
│   │       ├── event-bus.js        # W4/W5 — eventos Socket.IO centralizados
│   │       ├── auth-advanced.js    # A1/A2 — refresh tokens + jti blacklist (210 linhas)
│   │       ├── profissoes.js       # M2/M3 — 8 profissões canônicas + 27 UFs
│   │       ├── candidatura-cleanup.js # M9 — expiração automática de candidaturas
│   │       ├── webhook-retry.js    # N1 — retry de webhooks com falha
│   │       ├── search-fts.js       # M10 — FTS5 SQLite + tsvector PG
│   │       ├── alerting.js         # Item 10 — alertas 503 + Slack
│   │       ├── cron-internal.js   # Item 3 — cron jobs internos (opt-in)
│   │       ├── openapi.js          # P10 — spec OpenAPI 3.0 + Swagger UI
│   │       ├── stripe.js           # Feature 3 — Stripe Connect + Pix + idempotência (S2)
│   │       ├── push.js             # Feature 4 — Web Push (VAPID)
│   │       ├── registros.js       # Verificação de registros (aux)
│   │       └── ...
│   ├── migrations/             # 0001_init.sql, 0002_*.sql
│   ├── data/                   # SQLite (essencia.db) — ignorado pelo git
│   ├── uploads/                # Diplomas (auth U3) — ignorado pelo git
│   ├── Dockerfile              # Multi-stage build
│   ├── .dockerignore
│   └── package.json
│
├── frontend/                   # React 18 + Vite + TS + Tailwind + PWA + i18n
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/         # Navbar, Footer, Wizard, Chat, ProtectedRoute, LanguageSwitcher,
│   │   │                       # SinoNotificacoes (com useMatchingEvents), BotaoWhatsappFlutuante, etc.
│   │   ├── pages/              # Landing, Login, Cadastro (autocomplete profissões), Vagas*, Dashboards*,
│   │   │                       # ProfissionalPerfil, Admin, ComoFunciona
│   │   ├── context/            # AuthContext (JWT + localStorage)
│   │   ├── hooks/              # useTema, useMatchingEvents (Socket.IO + localStorage)
│   │   ├── i18n/               # i18next + locales (pt-BR, es, en)
│   │   ├── types/              # TypeScript types
│   │   ├── utils/              # api.ts (axios + interceptors), formatDate.ts
│   │   └── styles/             # index.css + paleta Tailwind
│   ├── public/                 # favicon.svg, PWA icons (192/512)
│   ├── vite.config.ts          # PWA + proxy /api → :4000
│   ├── tailwind.config.js      # Paleta serenity/emerald
│   └── package.json
│
├── k8s/
│   └── manifests.yaml          # Deployment + HPA + 2 PVCs + 2 CronJobs + Ingress TLS
├── scripts/
│   ├── smoke-test.sh           # 21+ testes E2E (saúde, auth, vagas, candidatura, etc.)
│   ├── smoke-test-v2.sh        # 28+ testes E2E com 6 features
│   ├── cron-webhook-retry.sh   # Cron job: POST /api/admin/webhooks/retry
│   └── cron-candidatura-cleanup.sh # Cron job: POST /api/admin/candidaturas/limpar-expiradas
├── render.yaml                 # Render Blueprint (1 Web + 2 Cron Jobs)
├── docker-compose.yml          # Orquestração local com Docker
├── .github/workflows/ci.yml    # CI: roda smoke test em push/PR
├── .github/workflows/deploy-netlify.yml # Deploy automático do frontend
├── DEPLOY.md                   # Guia de deploy (Netlify + Render + Docker + k8s)
├── CONTRIBUTING.md             # Workflow para múltiplos contribuidores
├── CHANGELOG.md                # Histórico das PRs #17, #18, #19
└── README.md
```

### Stack

| Camada         | Tecnologia                                           |
|----------------|------------------------------------------------------|
| Frontend       | React 18, Vite, TypeScript, TailwindCSS 3            |
| PWA            | vite-plugin-pwa (service worker, manifest)           |
| Roteamento     | react-router-dom v6                                  |
| HTTP           | axios com interceptors JWT                           |
| Real-time      | socket.io-client                                     |
| i18n           | react-i18next + i18next-browser-languagedetector     |
| Backend        | Node.js 20+, Express 4                               |
| Banco          | SQLite (better-sqlite3) OU PostgreSQL (pg-native)    |
| Auth           | jsonwebtoken + bcryptjs                              |
| Uploads        | multer (disk storage, MIME filter, 5 MB)             |
| Real-time      | socket.io (server)                                   |
| Webhook        | fetch nativo do Node 20 → `https://netlify.ai`       |

---

## 🗄️ Banco de Dados

Schema segue a sugestão do briefing com extensões para chat, webhook logs, avaliações
e verificação de registro:

```sql
users                (id, tipo_usuario, nome, email, senha_hash, telefone, criado_em)
profissionais_detalhes (id, id_user, diploma_url, diploma_nome_original,
                        diploma_verificado, registro_conselho, tipo_registro,
                        registro_verificado [0|1|2], registro_verificado_em,
                        especialidades JSON, disponibilidade JSON, bio)
vagas                (id, id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
                      complexidade [baixa|media], servico_descricao, profissional_desejado,
                      jornada_horario, jornada_escala, tipo_contrato [PJ|CLT],
                      remuneracao_tipo [plantao|hora], remuneracao_valor, regiao, status)
candidaturas         (id, id_vaga, id_profissional, mensagem,
                      status_candidatura [pendente|visualizada|aceita|recusada], criado_em)
mensagens            (id, id_remetente, id_destinatario, id_vaga, conteudo, lida, criado_em)
avaliacoes           (id, id_candidatura, id_avaliador, id_avaliado, avaliador_tipo, nota, comentario)
webhook_logs         (id, tipo, payload, status_code, resposta, erro, criado_em)
```

---

## 🚀 Como rodar

### Pré-requisitos
- Node.js **≥ 20** (testado em 22)
- npm 10+

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env       # ajuste JWT_SECRET se for produção
npm run seed               # popula SQLite com 3 vagas + 4 usuários demo
npm run dev                # http://localhost:4000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                # http://localhost:5173 (com proxy /api → :4000)
```

Acesse **http://localhost:5173** 🎉

### Build de produção
```bash
cd frontend && npm run build && npm run preview
```

---

## 👥 Contas de demonstração

Senha de todas: **`demo1234`**

| E-mail              | Tipo         | Nome                  |
|---------------------|--------------|-----------------------|
| `maria@demo.com`    | +Saúde       | Maria Silva           |
| `ana@demo.com`      | Profissional | Ana Carolina Souza    |
| `joao@demo.com`     | Profissional | João Pedro Lima       |
| `bia@demo.com`      | Profissional | Beatriz Mendes        |

---

## 🔌 Endpoints da API

### Sistema (3)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/health`                 | —    | Healthcheck (200/503 + DB status)      |
| GET    | `/api/openapi.json`           | —    | JSON OpenAPI 3.0 spec                   |
| GET    | `/api/docs`                   | —    | Swagger UI interativo (HTML via CDN)    |

### Helpers (1)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/profissoes`             | —    | 8 profissões canônicas + 27 UFs        |

### Auth (6)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| POST   | `/api/auth/cadastro`          | —    | Cadastro (profissional ou contratante) |
| POST   | `/api/auth/login`             | —    | Login → JWT (+refreshToken opt-in A1)  |
| POST   | `/api/auth/refresh`           | —    | A1 — Renova access token via refresh   |
| POST   | `/api/auth/logout`             | JWT  | A2 — Revoga token atual (jti blacklist) |
| GET    | `/api/auth/me`                | JWT  | Usuário logado + detalhes              |
| GET    | `/api/profissionais/me/recomendar` | JWT prof | M1 — Top N vagas recomendadas para o profissional |

### Vagas (8)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/vagas`                  | —    | Lista pública (10 filtros + paginação) |
| GET    | `/api/vagas/buscar?q=`        | —    | M10 — Busca textual FTS5/tsvector      |
| GET    | `/api/vagas/:id`              | —    | Detalhe + registra view                 |
| GET    | `/api/vagas/:id/recomendar`   | JWT contratante | M1 — Top N profissionais recomendados |
| POST   | `/api/vagas`                  | JWT  | Publica nova vaga + webhook + M2/M3 warning/UF |
| GET    | `/api/vagas/contratante/minhas` | JWT | contratante — Vagas do contratante logado |
| PATCH  | `/api/vagas/:id/status`       | JWT contratante | Pausar/reativar/fechar + W5 evento |

### Candidaturas (5)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| POST   | `/api/candidaturas`           | JWT prof | Candidatar-se (M8 — limite 50 default) |
| GET    | `/api/candidaturas/profissional/minhas` | JWT prof | Minhas candidaturas |
| GET    | `/api/candidaturas/vaga/:id`  | JWT contratante | Candidatos + W4 visualizada |
| PATCH  | `/api/candidaturas/:id`      | JWT contratante | Aceitar/recusar + W4+W5+M7 auto-close |
| GET    | `/api/candidaturas/:id/historico-status` | JWT | M11 — Histórico de transições auditadas |

### Profissionais (5)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/profissionais/:id`      | —    | Perfil público de profissional + stats |
| PUT    | `/api/profissionais/me`       | JWT prof | Atualiza perfil (normaliza registro)   |
| POST   | `/api/profissionais/me/diploma` | JWT prof | Upload de diploma (multipart)          |
| POST   | `/api/profissionais/me/verificar-registro` | JWT prof | Valida formato do registro → selo |
| GET    | `/api/profissionais/:id/verificacoes` | JWT | Histórico de verificações |

### Chat & Notificações (6)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/mensagens`              | JWT  | Lista de conversas                     |
| GET    | `/api/mensagens/:outroId`     | JWT  | Histórico de conversa                  |
| POST   | `/api/mensagens`              | JWT  | Enviar (W1 — sem echo ao remetente)    |
| GET    | `/api/notificacoes`           | JWT  | Notificações agregadas                  |
| POST   | `/api/notificacoes/marcar-lidas` | JWT | Marca todas como lidas                |
| GET    | `/api/notificacoes/contador`  | JWT  | Badge count para polling               |

### Favoritos (4)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| POST   | `/api/favoritos`              | JWT  | Toggle vaga/profissional               |
| GET    | `/api/favoritos`              | JWT  | Lista IDs favoritados                  |
| GET    | `/api/favoritos/vagas`        | JWT  | Vagas favoritadas + dados               |
| GET    | `/api/favoritos/profissionais` | JWT | Profissionais favoritados + dados      |

### Pagamentos (6)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/pagamentos/config`      | —    | Mock + platform_fee_pct                 |
| GET    | `/api/pagamentos/connect/status` | JWT prof | Stripe Connect status               |
| POST   | `/api/pagamentos/connect/onboarding` | JWT prof | Onboarding link |
| POST   | `/api/pagamentos`             | JWT contratante | Cria pagamento (Pix/cartao)       |
| GET    | `/api/pagamentos/vaga/:id`    | JWT  | Pagamentos de uma vaga                 |
| POST   | `/api/pagamentos/:id/confirmar` | JWT | Mock confirmação                       |
| POST   | `/api/pagamentos/webhook`     | —    | P1 — Stripe webhook (valida assinatura em live; S2 — idempotente) |

### Admin (16)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/admin/stats`            | admin | Métricas gerais                        |
| GET    | `/api/admin/users`            | admin | Lista usuários (filtro tipo)           |
| PATCH  | `/api/admin/users/:id`        | admin | Suspender / ativar                     |
| POST   | `/api/admin/users/:id/admin`  | admin | Promover a admin                       |
| GET    | `/api/admin/vagas`            | admin | Todas as vagas (filtro status)         |
| PATCH  | `/api/admin/vagas/:id`        | admin | Fechar / reativar (moderação)          |
| DELETE | `/api/admin/vagas/:id`        | admin | Remover vaga                           |
| GET    | `/api/admin/reports`          | admin | Denúncias                              |
| PATCH  | `/api/admin/reports/:id`      | admin | Analisar / resolver                    |
| GET    | `/api/admin/verificacoes`     | admin | Verificações de registro pendentes     |
| PATCH  | `/api/admin/verificacoes/:id` | admin | Aprovar / rejeitar verificação         |
| GET    | `/api/admin/webhooks`         | admin | Últimos webhooks                       |
| GET    | `/api/admin/webhooks/health`  | admin | Item 9 — Stats 24h (status + taxa_falha) |
| POST   | `/api/admin/webhooks/retry`  | admin | N1 — Dispara retry de webhooks falhos  |
| POST   | `/api/admin/candidaturas/limpar-expiradas` | admin | M9 — Expira candidaturas +30 dias |
| GET    | `/api/admin/alerts`           | admin | Item 10 — Lista alertas recentes       |
| POST   | `/api/admin/alerts/test`      | admin | Item 10 — Dispara alerta de teste     |
| GET    | `/api/admin/pagamentos`       | admin | Todos os pagamentos                    |

### Outros (8)
| Método | Rota                          | Auth | Descrição                              |
|--------|-------------------------------|------|----------------------------------------|
| GET    | `/api/i18n`                   | —    | Locales suportados                     |
| GET    | `/api/i18n/:locale`           | —    | Dicionário de strings                  |
| GET    | `/api/push/key`               | —    | VAPID public key + enabled             |
| POST   | `/api/push/subscribe`         | JWT  | Registra subscription                  |
| POST   | `/api/push/unsubscribe`       | JWT  | Remove subscription                    |
| POST   | `/api/avaliacoes`             | JWT  | Criar avaliação                        |
| GET    | `/api/avaliacoes/profissional/:id` | — | Stats públicas + reviews                |
| GET    | `/api/avaliacoes/minhas`      | JWT contratante | Avaliações que fiz               |

**Total: 38+ endpoints** — explore todos em `/api/docs` (Swagger UI interativo)

### WebSocket
Conexão: `ws://localhost:4000` com auth `{ token: <jwt> }`.
Eventos (8 no total):
- `mensagem:nova` (server → cliente) — payload `Mensagem` (W1: só destinatário)
- `mensagem:typing` (cliente ↔ cliente) — payload `{ de, para }`
- `candidatura:visualizada` (W4) — notifica profissional
- `candidatura:aceita` (W4) — notifica profissional
- `candidatura:recusada` (W4) — notifica profissional
- `vaga:fechada` (W5) — notifica favoritadores + candidatos pendentes
- `vaga:pausada` (W5) — notifica favoritadores
- `vaga:reativada` (W5) — notifica favoritadores

---

## 🔗 Webhook netlify.ai

Toda vez que:
- Uma **vaga é criada** (`POST /api/vagas`)
- Uma **candidatura é enviada** (`POST /api/candidaturas`)
- Uma **candidatura é aceita/recusada** (`PATCH /api/candidaturas/:id`)
- Uma **verificação de registro é executada** (`POST /api/profissionais/me/verificar-registro`)

o backend faz `POST https://netlify.ai` com payload JSON:
```json
{
  "event": "vaga_criada",
  "source": "essencia-do-cuidar",
  "timestamp": "2026-10-09T13:32:00.000Z",
  "data": { "vaga_id": 4, "contratante_id": 1 }
}
```

A resposta é registrada na tabela `webhook_logs` (status_code, resposta, erro).
Falhas são **best-effort** — não bloqueiam o fluxo principal.

> ℹ️ O endpoint `https://netlify.ai` retornou `404` durante os testes E2E no sandbox,
> o que é o comportamento esperado (o sistema trata graciosamente e mantém o registro).

---

## 🎨 Customização visual

A paleta está em `frontend/tailwind.config.js`:

```js
colors: {
  serenity: { 500: "#4A90E2", ... },
  emerald:  { 500: "#50E3C2", ... }
}
```

Use `bg-serenity-500`, `text-emerald-600`, etc. Os componentes utilitários (`btn-primary`,
`card`, `input`, `badge-*`) estão em `frontend/src/styles/index.css`.

---

## 🔒 Segurança

- Senhas com **bcrypt** (10 rounds)
- **JWT** com expiração configurável (default 7d)
- Validação rigorosa de uploads: MIME, tamanho (5 MB), extensão
- Uploads servidos por rota estática isolada
- Headers CORS restritos ao `FRONTEND_URL`
- SQL preparado (prepared statements) — sem SQL injection
- Apenas **baixa e média complexidade** são aceitas (regra de negócio)
- Validação **estrutural** de registros via regex (ver seção "Verificação de registros")
- Recomenda-se verificação independente do registro no site do conselho (COREN, CRM...)

---

## 📱 PWA

Manifest gerado automaticamente por `vite-plugin-pwa`:
- `name`, `short_name`, `theme_color: #4A90E2`
- Ícones 192×192 e 512×512 gerados a partir do favicon SVG
- Service worker com `registerType: "autoUpdate"`

Para instalar: abra no Chrome mobile, banner aparecerá automaticamente.

---

## 🧪 Fluxo E2E testado

1. ✅ `GET /api/health` → 200
2. ✅ `POST /api/auth/cadastro` → 201 + JWT
3. ✅ `POST /api/auth/login` → 200 + JWT
4. ✅ `GET /api/vagas` → lista 4 vagas
5. ✅ `POST /api/vagas` (contratante) → 201 + webhook
6. ✅ `POST /api/candidaturas` (profissional) → 201 + webhook
7. ✅ `GET /api/candidaturas/vaga/:id` (contratante) → vê candidato
8. ✅ `PATCH /api/candidaturas/:id` → aceita + webhook
9. ✅ `POST /api/mensagens` → chat bilateral
10. ✅ `GET /api/mensagens/:outroId` → histórico
11. ✅ Validação rejeita `complexidade: "alta"`
12. ✅ Validação rejeita senha < 6 chars
13. ✅ Upload de diploma rejeita sem arquivo
14. ✅ Candidatura a vaga inexistente → 404
15. ✅ Todos webhooks logados em `webhook_logs`
16. ✅ `POST /api/avaliacoes` exige candidatura aceita + vaga fechada
17. ✅ Avaliação duplicada → 409
18. ✅ `GET /api/avaliacoes/pendentes` lista pendentes do usuário
19. ✅ Stats públicas no perfil: `media` + `total` corretos
20. ✅ `POST /api/profissionais/me/verificar-registro` com COREN válido → estado `1`
21. ✅ `POST /api/profissionais/me/verificar-registro` com CRM inválido → estado `2`
22. ✅ `POST /api/profissionais/me/verificar-registro` sem dados → 400
23. ✅ Auditoria de verificações gravada em `webhook_logs`
24. ✅ Perfil público inclui `registro_verificado`

---

## 🛠️ Próximos passos

- [x] Migração para PostgreSQL em produção
- [x] Verificação de registros (CRM/COREN/CREFITO/CRP/CRN)
- [x] Pagamento via Pix / Stripe Connect (split 90/10)
- [x] Notificações push (Web Push / VAPID)
- [x] Painel administrativo (moderação, stats, users, verificações, pagamentos)
- [x] Internacionalização (pt-BR, es, en) com react-i18next

### Novas features (branch `feat/6-features`)

#### 1. PostgreSQL ready
Driver unificado (`backend/src/db/driver.js`) — `DATABASE_URL` ausente usa SQLite,
presente usa `pg`. Migração: `npm --prefix backend run migrate:pg`.

#### 2. Verificação de registros
Validação de formato para CRM/COREN/CREFITO/CRP/CRN + UF. Endpoint
`PUT /api/profissionais/me` valida; histórico em `GET /api/profissionais/:id/verificacoes`.
Admin aprova/rejeita em `PATCH /api/admin/verificacoes/:id` (atualiza selo no perfil).

#### 3. Stripe Connect + Pix
Marketplace pattern: profissional cria conta Connect Express, contratante paga
via Pix com `application_fee_amount` (10% plataforma). Modo `STRIPE_MOCK=true`
simula o fluxo sem API key — útil pra dev. Frontend tem `PaymentModal.tsx` e
`OnboardingConnectModal.tsx`.

#### 4. Web Push (VAPID)
Funciona em PWA sem FCM. Gera chaves com `npx web-push generate-vapid-keys` e
seta `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` no `.env`. Sem chaves, opera em
no-op. Frontend: `components/PushPrompt.tsx`.

#### 5. Painel administrativo
Login: `admin@demo.com` / `admin1234`. 6 tabs (stats, users, vagas, verificações,
pagamentos, webhooks). Endpoints sob `/api/admin/*` — todos exigem `is_admin=1`.
Admin pode suspender usuários, fechar vagas, aprovar/rejeitar registros.

#### 6. i18n (pt-BR, es, en)
Frontend: `react-i18next` com detecção automática via `localStorage` (chave
`essencia_lang`). Backend: dicionários em `src/i18n/dictionaries.js`, expostos
em `/api/i18n/:locale` para sincronizar.

### Smoke test
```bash
npm --prefix backend run seed && node backend/src/index.js
BASE=http://localhost:4000 bash scripts/smoke-test-v2.sh
# 28/28 deve passar
```

---

## 📄 Licença

MIT — construa em cima com cuidado. 💙
