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
- README.md tem overview técnico e endpoints da API
- DEPLOY.md tem guia de deploy (Netlify + Render)
