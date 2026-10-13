# Essência do Cuidar

Marketplace de profissionais de saúde para atendimento domiciliar de **baixa e média complexidade**.

> Construído a partir da spec em `PROMPT_ESSENCIA_DO_CUIDAR` (do repo de briefing).

## Stack

- **Frontend:** Vite + React 18 + Tailwind CSS + React Router
- **Backend:** Node.js 18+ (testado em 22.19) + Express + `node:sqlite` (módulo nativo do Node 22, sem build de nativo) + JWT + bcryptjs
- **Webhook simulado:** fetch para `https://netlify.ai` em cada vaga criada / candidatura enviada (com timeout e falha silenciosa, conforme spec)

## Estrutura

```
essencia-do-cuidar/
├── backend/        # API Express + SQLite
│   ├── server.js
│   ├── db.js       # schema + conexão
│   ├── seed.js     # cria 1 contratante, 1 profissional, 1 vaga demo
│   ├── middleware/auth.js
│   ├── routes/{auth,profissionais,vagas,candidaturas,chat,webhook}.js
│   ├── data/       # SQLite (criado em runtime)
│   └── uploads/    # diplomas (placeholder)
└── frontend/       # SPA Vite
    ├── src/pages/  # Home, ComoFunciona, Login, Register (wizard), dashboards, VagaDetail, Candidatos, ChatPage
    └── src/components/, context/, api.js
```

## Como rodar

### 1. Backend

```bash
cd backend
cp .env.example .env       # ajuste JWT_SECRET se quiser
npm install
npm run seed               # opcional: cria usuários demo
npm run dev                # http://localhost:3001
```

### 2. Frontend (em outro terminal)

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Acesse `http://localhost:5173`. O Vite faz proxy de `/api` e `/uploads` para o backend.

## Credenciais demo (após `npm run seed`)

| Papel         | Email           | Senha      |
|---------------|-----------------|------------|
| Contratante   | maria@demo.com  | senha123   |
| Profissional  | joao@demo.com   | senha123   |

## Endpoints principais

| Método | Rota                              | Quem                       |
|--------|-----------------------------------|----------------------------|
| POST   | `/api/auth/register`              | público (multipart c/ 2 arquivos ou JSON puro) |
| POST   | `/api/auth/login`                 | público                    |
| GET    | `/api/auth/me`                    | autenticado                |
| GET    | `/api/profissionais/me`           | profissional               |
| PUT    | `/api/profissionais/me`           | profissional               |
| PUT    | `/api/profissionais/me/documentos` | profissional (upload avulso de diploma OU doc conselho) |
| GET    | `/api/profissionais/:id`          | autenticado                |
| GET    | `/api/vagas?complexidade=&regiao=&q=` | autenticado           |
| GET    | `/api/vagas/:id`                  | autenticado                |
| POST   | `/api/vagas`                      | contratante                |
| GET    | `/api/vagas/minhas/list`          | contratante                |
| PATCH  | `/api/vagas/:id/status`           | contratante (dono)         |
| POST   | `/api/candidaturas`               | profissional               |
| GET    | `/api/candidaturas/minhas`        | profissional               |
| GET    | `/api/candidaturas?vaga=X`        | contratante (dono da vaga) — inclui URLs dos documentos |
| PATCH  | `/api/candidaturas/:id`           | contratante (dono)         |
| GET    | `/api/chat?vaga=X`                | contratante ou candidato   |
| POST   | `/api/chat`                       | contratante ou candidato   |
| GET    | `/api/webhook/health`             | público                    |

## Upload de documentos (profissional)

O cadastro do profissional **exige** dois arquivos (upload multipart, até 10 MB cada):

- **Diploma / Certificado** — PDF/JPG/PNG/WEBP
- **Registro no Conselho** — comprovante (carteira, declaração, etc.)

Os arquivos são salvos em `backend/uploads/{userId}/` com nome gerado (`{timestamp}-{random}-{nome-sanitizado}.{ext}`), e as URLs ficam gravadas em `profissionais_detalhes.diploma_url` e `registro_conselho_url`. Servidos via `GET /uploads/{userId}/{arquivo}`.

Para trocar um documento individualmente após o cadastro:

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -F "tipo=diploma" \
  -F "arquivo=@/caminho/novo-diploma.pdf" \
  http://localhost:3001/api/profissionais/me/documentos
```

Validações aplicadas:
- Tipo MIME ou extensão precisa estar em `{pdf, jpg, jpeg, png, webp}`
- Tamanho ≤ 10 MB
- `multer` 2.x com fileFilter e errorHandler (responde 400/413 com mensagem clara)

## O que está implementado

- ✅ Landing pública (Home, Como Funciona) com paleta e tom do brief
- ✅ Cadastro em **wizard multi-etapa** (4 passos para contratante, 5 para profissional) com tags de especialização e grade de disponibilidade
- ✅ **Upload de documentos do profissional**: diploma + registro do conselho (PDF/JPG/PNG/WEBP, até 10 MB cada), com preview, validação em tempo real, e storage em `backend/uploads/{userId}/`
- ✅ Endpoint para trocar documento depois (`PUT /api/profissionais/me/documentos`)
- ✅ Contratante vê selos de verificação (`✓ Diploma`, `✓ Conselho`) e links de download na lista de candidatos
- ✅ Login com JWT (Bearer) e refresh de contexto
- ✅ Regras do brief: complexidade apenas **baixa** ou **média** (validação backend e UI)
- ✅ Dashboards distintos:
  - **Profissional:** perfil, busca de vagas com filtros, candidaturas, status
  - **Contratante:** publicar vaga (com formulário completo), minhas vagas, mudar status (pausar/reativar/encerrar), ver candidatos
- ✅ Candidatura com mensagem e proteção contra duplicidade
- ✅ Chat interno por vaga (apenas contratante e candidatos), com polling 5s (substituível por SSE/WS depois)
- ✅ Webhook simulado para `https://netlify.ai` em `vaga.created` e `candidatura.created`, com `AbortController` 5s e log
- ✅ Validações de campo (registro conselho, idade, valor monetário, complexidade, tipo e tamanho de arquivo)
- ✅ Hash de senha (bcrypt)
- ✅ Mobile-first com `container-page` e breakpoints

## O que **não** está implementado (próximas iterações sugeridas)

- ⏳ Página "Meus Documentos" no dashboard do profissional para re-upload fácil (hoje o `PUT /me/documentos` já funciona via API, falta UI dedicada)
- ⏳ Sistema de avaliações dos profissionais após o serviço
- ⏳ PWA (manifest + service worker) — estrutura já é mobile-first
- ⏳ Notificações em tempo real (SSE/WebSocket) — hoje o chat usa polling
- ⏳ Recuperação de senha por e-mail
- ⏳ Painel admin para revisar registros de conselho
- ⏳ Testes automatizados (Vitest no front, supertest no back)
- ⏳ CI / deploy (Vercel pro front, Fly.io/Render pro back, SQLite precisa virar Postgres em produção)

## Por que `node:sqlite` em vez de `better-sqlite3`?

A spec não exigia um driver específico. Optei por `node:sqlite` (nativo do Node 22+) para evitar a dependência de build de módulo nativo na instalação — assim `npm install` é rápido e funciona em qualquer máquina com Node 22 sem toolchain de C++. Se o seu ambiente for Node < 22, troque pelo `better-sqlite3` (a API é quase idêntica: `db.prepare`, `.run`, `.get`, `.all` — a única diferença é que `node:sqlite` ainda não expõe `db.transaction()`, por isso o helper `transaction()` em `db.js`).

## Variáveis de ambiente (backend)

Veja `backend/.env.example`. As principais:

- `PORT` — porta do Express (default 3001)
- `JWT_SECRET` — segredo do token
- `WEBHOOK_URL` — endpoint do webhook (default `https://netlify.ai`)
- `CORS_ORIGIN` — origens permitidas, separadas por vírgula

## Notas de segurança

- Senhas armazenadas com **bcrypt** (10 rounds).
- JWT expira em 7 dias — token armazenado em `localStorage` (ok pra demo; em produção, considerar httpOnly cookie).
- Validação de papel (`profissional` / `contratante`) e de dono do recurso nas rotas.
- Webhook externo é disparado com **timeout** e **falha silenciosa** — não bloqueia a operação principal.
- O brief recomenda conferir o registro do conselho no site da classe — exibimos isso na Home e em "Como Funciona".
