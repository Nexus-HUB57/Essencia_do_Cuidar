# Contribuindo com o Essência do Cuidar

Esse projeto roda com várias pessoas mexendo ao mesmo tempo
(backend, frontend, i18n, pagamentos, push, admin...). Para evitar
que um commit atropele o outro, seguimos um workflow simples:

## 1. Regras de ouro

- **Nunca** `git push --force` em `main` ou em qualquer branch de
  outra pessoa. Se seu `git push` foi rejeitado, faça `git pull
  --rebase` (ou `git merge`) — não force.
- **Nunca** commite direto em `main`. Faça branch, PR, review.
- Commits pequenos e descritivos. Um commit = uma ideia.
  Mensagem no formato `<tipo>(<escopo>): <descrição>` em pt-BR ou en.
  Tipos comuns: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- Não misture mudanças não relacionadas no mesmo commit/PR.

## 2. Branches

Convenção: `feat/<escopo-curto>`, `fix/<escopo-curto>`, `chore/<escopo-curto>`.

Exemplos reais do repo:
- `feat/avaliacoes-documentos-pwa` — Mavis
- `feat/registro-verificacao` — Lucas
- `feature/t1-postgres` — Coder
- `feat/m3-2026-10-16` — branch desta sessão (Mavis, 2026-10-16)

Branches pessoais podem ser apagadas depois do merge. Branches de
feature compartilhada (mais de uma pessoa mexendo) **não** apaga
sem combinar antes.

## 3. Setup local

```bash
# Backend
cd backend
cp .env.example .env       # ajustar JWT_SECRET se for prod
npm install
npm run seed               # popula SQLite com 3 vagas + 8 usuários demo
npm run dev                # http://localhost:4000

# Frontend (em outro terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Acesse `http://localhost:5173`. Senha de todas as contas demo:
`demo1234` (exceto `admin@demo.com` que é `admin1234`).

## 4. Antes de abrir PR

1. `npm run install:all` na raiz (instala backend + frontend)
2. `npm run seed` no backend (recria o banco do zero)
3. `bash scripts/smoke-test.sh` — todos os testes E2E devem passar
4. `cd frontend && npm run build` — build de produção não pode quebrar
5. Se você mexeu no schema, atualize **ambos** os drivers em
   `backend/src/db/sqlite.js` e `backend/src/db/postgres.js` (são
   quase idênticos — só muda o tipo `INTEGER` → `SERIAL`, `datetime('now')`
   → `now()::text`, etc).

## 5. Migrations

Não usamos sistema de migrations formal (Knex/Prisma) ainda. As tabelas
são criadas via `CREATE TABLE IF NOT EXISTS` em
`backend/src/db/sqlite.js` e `postgres.js`. Para adicionar coluna em
banco existente, use o padrão idempotente:

```js
safeExec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
```

`safeExec` está em `sqlite.js` e ignora erro "already exists".

## 6. Estilo de código

- Backend: ESM (import/export), 2 espaços, aspas simples.
- Frontend: TSX, 2 espaços, aspas simples.
- Sem prettier/eslint configurado ainda — siga o estilo dos arquivos
  vizinhos. Se for adicionar config, faça num PR separado pra não
  tocar em tudo de uma vez.

## 7. Mensagens de commit

Bom:
```
feat(avaliacoes): modal de avaliação no dashboard do contratante
fix(seed): migrar parte de avaliações para o driver unificado
chore(docker): healthcheck no backend
docs(env): documenta todas as variáveis do .env.example
```

Ruim:
```
wip
fix
atualizações
resolve bug da Ana
```

## 8. Onde pedir ajuda

- Issues no GitHub: https://github.com/Nexus-HUB57/Essencia_do_Cuidar/issues
- README.md tem overview técnico e 38+ endpoints documentados
- DEPLOY.md tem guia de deploy (Netlify + Render + Docker + k8s + cron)
- CHANGELOG.md tem histórico das PRs #17, #18, #19
- `/api/docs` no backend rodando tem Swagger UI interativo
- `/api/openapi.json` para importar em Postman/Insomnia

## 9. Arquitetura atual (pós-PR #19)

Backend tem 12 services (em `backend/src/services/`):

| Service                    | Função                                                  |
|----------------------------|---------------------------------------------------------|
| `netlify.js`                | Webhook netlify.ai (best-effort)                        |
| `registroValidator.js`     | Validação estrutural de CRM/COREN/CREFITO/CRP/CRN       |
| `matching.js`               | **M1** — Algoritmo de score de matching (322 linhas)    |
| `event-bus.js`              | **W4/W5** — Eventos Socket.IO centralizados            |
| `auth-advanced.js`          | **A1/A2** — Refresh tokens + jti blacklist (210 linhas) |
| `profissoes.js`             | **M2/M3** — 8 profissões canônicas + 27 UFs            |
| `candidatura-cleanup.js`   | **M9** — Expiração automática de candidaturas          |
| `webhook-retry.js`          | **N1** — Retry de webhooks com falha                   |
| `search-fts.js`             | **M10** — FTS5 SQLite + tsvector PG                     |
| `alerting.js`               | **Item 10** — Alertas 503 + Slack                       |
| `cron-internal.js`          | **Item 3** — Cron jobs internos (opt-in)                |
| `openapi.js`                | **P10** — Spec OpenAPI 3.0 + Swagger UI                |
| `stripe.js`                 | Feature 3 — Stripe Connect + Pix + idempotência (S2)    |
| `push.js`                   | Feature 4 — Web Push (VAPID)                           |
| `registros.js`               | Auxiliar para validação de registros                   |

Tabelas no schema (17):

```
users (com is_admin, suspended_at, suspended_reason)
profissionais_detalhes (com registro_verificado, especialidades, etc.)
vagas (com regiao_uf, complexidade CHECK baixa|media)
candidaturas (com atualizada_em, UNIQUE id_vaga+id_profissional)
mensagens
webhook_logs (com stripe_event_id para idempotência)
avaliacoes (UNIQUE id_contratante+id_vaga)
verificacao_registros
pagamentos (Stripe Connect + Pix)
stripe_connect (contas Express)
push_subscriptions (VAPID)
admin_audit
reports
favoritos (B5 — UNIQUE id_user+tipo+id_recurso)
vaga_visualizacoes (B2 — contador de views)
candidatura_status_log (M11 — auditoria de transições)
token_blacklist (A2 — revogação de tokens JWT)
```

Variáveis de ambiente: ver `backend/.env.example` para a lista completa.
A maioria tem defaults funcionais — só `JWT_SECRET` é obrigatório em produção.

Endpoints da API: 38+ — ver `README.md` (seção "🔌 Endpoints da API") ou
`/api/docs` no backend rodando para explorar interativamente.

Eventos Socket.IO (8 no total): ver `README.md` (seção WebSocket).

## 10. Antes de enviar PR

- [ ] `npm --prefix backend run seed` não quebra (schema ok)
- [ ] `npm --prefix frontend run build` sem erros de tipo
- [ ] Backend inicia: `env -u DATABASE_URL npm --prefix backend run dev`
- [ ] Testes E2E: `BASE=http://localhost:4000 bash scripts/smoke-test.sh`
- [ ] Ver `/api/health` retorna 200
- [ ] Ver `/api/docs` retorna 200 (Swagger UI)
- [ ] Ver `/api/openapi.json` retorna JSON válido

Se mexeu em schemas, rodar `node --check` em todos os arquivos novos/modificados.

