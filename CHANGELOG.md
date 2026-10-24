# Changelog

Histórico das mudanças do projeto `Essência do Cuidar`.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionamento [SemVer](https://semver.org/lang/pt-BR/).

---

## [Unreleased] — 2026-10-23

### Documentação
- README.md atualizado com seção "Recursos novos (PR #17, #18, #19)" no topo
- README.md — tabela de endpoints expandida (38+ endpoints organizados em 9 categorias)
- README.md — árvore de arquivos atualizada com todos os novos services e configs
- CHANGELOG.md criado (este arquivo)

---

## [1.3.0] — 2026-10-23 — PR #19: 12 itens pós-merge

Commit: `e5a8fc9` → merge `c939267`

### Adicionado — Deploy configs
- `render.yaml` — Render Blueprint (1 Web Service + 2 Cron Jobs automáticos)
- `k8s/manifests.yaml` — k8s completo (Deployment, HPA 2-10, 2 PVCs, 2 CronJobs, Ingress TLS, 300+ linhas)
- `backend/Dockerfile` — multi-stage build (deps + runtime), roda como user `node`
- `backend/.dockerignore`
- `scripts/cron-webhook-retry.sh` — script para crontab host
- `scripts/cron-candidatura-cleanup.sh` — script para crontab host
- `backend/src/services/cron-internal.js` — cron jobs internos via setInterval (opt-in via `ENABLE_INTERNAL_CRON=true`)

### Adicionado — Alerting + Monitoring
- `backend/src/services/alerting.js` — emite alertas JSON estruturado (Loki/Datadog compat)
  + persiste em `data/alerts.log` + envia para Slack se `SLACK_WEBHOOK_URL` setada
  + throttle 5min por tipo
- Integrado em `/api/health` — 503 dispara alerta `db_down`
- `GET /api/admin/alerts` — lista alertas recentes (default 50, max 200)
- `POST /api/admin/alerts/test` — dispara alerta de teste
- `GET /api/admin/webhooks/health` — stats de webhooks últimas 24h
  (status healthy/warning/critical + por_status + por_tipo + taxa_falha)

### Adicionado — Busca textual FTS
- `backend/src/services/search-fts.js` — FTS5 SQLite (tabela virtual + triggers)
  + tsvector PostgreSQL (índice GIN)
- `GET /api/vagas/buscar?q=<texto>&limite=20&offset=0`
- Tokenizer `unicode61 remove_diacritics 2` (acentos ignorados)
- Fallback para LIKE se FTS indisponível

### Adicionado — Refresh tokens opt-in
- `POST /api/auth/login` retorna `refreshToken` + `expiresIn` quando `ENABLE_REFRESH_TOKENS=true`
- `POST /api/auth/refresh` já implementado (Sprint 3) — recebe refresh, retorna novo access
- Default: `ENABLE_REFRESH_TOKENS=false` (mantém compat legado)

### Adicionado — Frontend integration
- `frontend/src/components/SinoNotificacoes.tsx` integrado com `useMatchingEvents` hook
  (max(polling, realtime) — garante não sub-notificar)
- `frontend/src/pages/Cadastro.tsx` carrega `/api/profissoes` no boot (autocomplete)
- `frontend/src/pages/DashboardContratante.tsx` tem select dropdown de UF + envia `regiao_uf`

### Variáveis de ambiente novas
- `ENABLE_INTERNAL_CRON` (default false) — ativa cron jobs internos (single-instance only)
- `SLACK_WEBHOOK_URL` (opcional) — envia alertas para Slack
- `ENABLE_REFRESH_TOKENS` (default false) — ativa refresh token no login
- `BACKEND_URL` (opcional) — URL base para OpenAPI spec

### Documentação
- `backend/.env.example` expandido com todas as novas env vars dos Sprints 1-3 + 12 itens

---

## [1.2.0] — 2026-10-22 — PR #18: Sprint 0+1+2+3

Commit: `ef7bba1` → merge `1191379`

### Sprint 0 — Segurança crítica (P1-P4)
- **P1** — Webhook Stripe agora valida assinatura em modo live (`stripe.webhooks.constructEvent`)
- **P2** — Backend aborta startup em `NODE_ENV=production` se `JWT_SECRET` ausente
- **P3** — Erro 500 não expõe mais `detalhe: err.message` em produção
- **P4** — `authRequired` verifica `suspended_at` em TODA request (não só no login)

### Sprint 1 — Matching automático + protocolos
- **M1** — `services/matching.js` (322 linhas) com algoritmo de score 0-1 (5 componentes)
- **M1** — `GET /api/vagas/:id/recomendar` e `GET /api/profissionais/me/recomendar`
- **M4** — Filtros expandidos: `tipoContrato`, `remuneracaoTipo`, `jornadaEscapa`, `regiaoUf`
  + ordenação (`recentes`/`antigos`/`remuneracao`) + paginação (`limite`, `offset`, `total`)
- **M5** — `notifyNetlify` com `.catch(() => {})` em todos os 4 callers
- **M7** — Auto-close vaga após primeiro aceite (env `AUTO_CLOSE_ON_ACCEPT`)
- **W1** — Socket.IO não emite mais `mensagem:nova` ao remetente
- **S2** — Idempotência do webhook Stripe via `pagamentos.stripe_event_id`
- **N1** — `services/webhook-retry.js` para retry de webhooks com falha

### Sprint 2 — Eventos Socket.IO em tempo real + auditoria
- **W4** — `services/event-bus.js` (196 linhas) com helpers de Socket.IO + Web Push
  - Eventos: `candidatura:visualizada/aceita/recusada`
- **W5** — Eventos `vaga:fechada/pausada/reativada` (notifica favoritadores + candidatos pendentes)
- **M11** — Tabela `candidatura_status_log` (SQLite + PostgreSQL) com FK CASCADE + índice
  - `GET /api/candidaturas/:id/historico-status` — histórico completo auditado
- **N1 endpoint** — `POST /api/admin/webhooks/retry` (admin-only) dispara `retryFailedWebhooks()`
- `frontend/src/hooks/useMatchingEvents.ts` (182 linhas) consome 7 eventos + persiste em localStorage

### Sprint 3 — Robustez + Auth avançada + Docs
- **M2** — `services/profissoes.js` (110 linhas) com 8 profissões canônicas + sinônimos + 27 UFs
  + `GET /api/profissoes` + warning retrocompatível
- **M3** — Coluna `vagas.regiao_uf` (SQLite + PostgreSQL, idempotente) + validação + filtro `?regiaoUf=SP`
- **M8** — `POST /api/candidaturas` verifica `MAX_CANDIDATURAS_PER_VAGA` (default 50)
- **M9** — `services/candidatura-cleanup.js` com `expirarCandidaturasAntigas()`
  + `POST /api/admin/candidaturas/limpar-expiradas`
- **P9** — `apiLimiter` agora usa `keyGenerator` que extrai `user.id` do JWT (rate limit por user)
- **A1+A2** — `services/auth-advanced.js` (210 linhas) com refresh tokens + jti blacklist
  + `signToken` agora inclui `jti` único em todos os tokens
  + `POST /api/auth/refresh` e `POST /api/auth/logout`
- **U3** — `/uploads/` agora requer autenticacao (`AUTH_UPLOADS=true` default)
  + anti-path-traversal + 404 para arquivo inexistente
- **P10** — `services/openapi.js` (260 linhas) com OpenAPI 3.0 spec + Swagger UI HTML via CDN
  + `GET /api/openapi.json` + `GET /api/docs`

### Tabelas novas
- `favoritos` (B5) — UNIQUE `(id_user, tipo, id_recurso)`
- `vaga_visualizacoes` (B2) — contador de views
- `candidatura_status_log` (M11) — auditoria de transições
- `token_blacklist` (A2) — revogação de tokens JWT via jti

### Variáveis de ambiente novas (Sprint 1-3)
- `JWT_ACCESS_EXPIRES=15m`, `JWT_REFRESH_EXPIRES=7d`
- `MAX_CANDIDATURAS_PER_VAGA=50`, `CANDIDATURA_EXPIRA_DIAS=30`
- `AUTH_UPLOADS=true`, `AUTO_CLOSE_ON_ACCEPT=true`
- `RATE_LIMIT_MAX=300`, `RATE_AUTH_MAX=30`

---

## [1.1.0] — 2026-10-22 — PR #17: Recuperação Linha A + B1-B6 fix

Commit: `9cd69c3` → merge `1e1155d`

### Recuperado — Linha A perdida (10 cherry-picks)
- 3 commits verificação de conselho (CRM/COREN/CREFITO/CRP/CRN)
  - `services/registroValidator.js` + endpoint `POST /me/verificar-registro`
  - Tipos TS `RegistroVerificadoEstado` + 4 interfaces novas (Avaliacao, etc.)
  - Frontend com badge de 3 estados (verificado/em análise/não validado)
- Smoke test expandido (5 casos novos para verificação de registro)
- README — seção de verificação de registros + checklist
- 3 commits de imagens oficiais (logo, capa, processo, etc.) + roteiros/
- Types TS para `RegistroVerificadoEstado` + `RegistroVerificacaoResultado`
- Perfil profissional i18n + badge 3 estados + selo com data

### Corrigido — Bugs críticos B1-B6 (identificados em revisão técnica prévia)
- **B1** — `backend/src/index.js`: imports faltantes de `favoritosRouter` e `notificacoesRouter`
  (impediam startup do backend)
- **B2** — `backend/src/routes/vagas.js`: importado `jwt`, migrado `db.prepare()` → `await db.run/get`,
  adicionada tabela `vaga_visualizacoes`
- **B3** — `backend/src/routes/candidaturas.js`: migrado `db.prepare()` para API async
- **B4** — `backend/src/routes/favoritos.js` e `notificacoes.js`: migrado todo o uso de `db.prepare()`
- **B5** — Tabela `favoritos` adicionada no schema (SQLite + PostgreSQL)
- **B6** — Coluna `candidaturas.atualizada_em` adicionada via `safeExec`
- Extra: `frontend/src/pages/Landing.tsx:166` — `</details>` orfa corrigido

---

## [1.0.0] — Pre-merge (23 commits)

Estado inicial do `main` antes da recuperação. Stack básica com:
- Auth JWT (sem refresh, sem jti)
- Vagas + candidaturas + chat + mensagens
- 6 features (PG, registros, Stripe, push, admin, i18n)
- Sem matching automático
- Sem auditoria de transições
- Sem alertas
- Sem OpenAPI docs
- Backend NÃO iniciava (B1-B6 bloqueantes)

---

## Como atualizar para versões novas

### De 1.0.0 → 1.1.0 (PR #17)
- Pull main → resolve conflitos se houver
- `npm install` (sem deps novas)
- Reiniciar backend — schema migra automaticamente (safeExec)

### De 1.1.0 → 1.2.0 (PR #18)
- Pull main
- `npm install` (sem deps novas)
- Configurar env vars novas (todas opcionais com defaults):
  - `JWT_SECRET` (obrigatório em `NODE_ENV=production`)
  - `MAX_CANDIDATURAS_PER_VAGA`, `CANDIDATURA_EXPIRA_DIAS`
  - `AUTH_UPLOADS=true`, `AUTO_CLOSE_ON_ACCEPT=true`
- Reiniciar backend — schema cria tabelas novas automaticamente

### De 1.2.0 → 1.3.0 (PR #19)
- Pull main
- `npm install` (sem deps novas)
- Configurar env vars opcionais:
  - `ENABLE_INTERNAL_CRON=false` (true para single-instance sem cron externo)
  - `SLACK_WEBHOOK_URL=` (opcional)
  - `ENABLE_REFRESH_TOKENS=false` (true para ativar refresh tokens no login)
- Reiniciar backend — FTS5 tabela criada automaticamente
