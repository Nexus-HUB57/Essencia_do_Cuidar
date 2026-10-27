# Essência do Cuidar

> Marketplace de profissionais de saúde para atendimento domiciliar de idosos e pacientes
> de **baixa e média complexidade**. Aplicação **full-stack** com frontend React PWA, backend
> Node.js + SQLite e integração de webhook.

![Status](https://img.shields.io/badge/status-MVP-blue) ![Stack](https://img.shields.io/badge/stack-React%20%2B%20Node%20%2B%20SQLite-emerald)

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
- ✅ **Login com JWT** (Bearer token, 7 dias de validade)
- ✅ **Dashboard do Profissional**: buscar vagas, filtros, candidatar-se, perfil, chat
- ✅ **Dashboard do +Saúde**: publicar vaga, gerenciar candidatos, aceitar/recusar, chat
- ✅ **Listagem pública de vagas** com filtros (profissional, complexidade, região, remuneração)
- ✅ **Chat interno** tempo real (Socket.IO) com fallback HTTP
- ✅ **Upload de diploma** (PDF/JPG/PNG, 5 MB) com selo de verificação
- ✅ **Validação estrutural de registros** (CRM, COREN, CREFITO, CRP, CRN) com 3 estados
- ✅ **Matching automático** Vagas x Profissional — score 0–1 com 6 critérios explicados
- ✅ **Recomendações dos dois lados** — profissionais por vaga, vagas por profissional
- ✅ **Webhook de notificação** para `https://netlify.ai` em cada vaga criada e candidatura
- ✅ **PWA** instalável (manifest, service worker via vite-plugin-pwa)
- ✅ **Mobile-first** (testado em viewport pequeno)
- ✅ **Internacionalização** (pt-BR, es, en) com switcher
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

## 🎯 Sistema de Matching (Vagas x Profissional)

> Endpoint do dia a dia: quem contrata **vê profissionais recomendados** para a vaga
> que publicou; quem trabalha **vê vagas recomendadas** para o seu perfil.
> O matching é **aditivo** — o fluxo manual (filtrar + candidatar) continua intacto.

### Como o score é calculado

Cada par (vaga, profissional) recebe um score de **0.0 a 1.0**, com pesos que
somam 1.0. Critérios sem dados (ex.: profissional sem região cadastrada) têm o
peso **redistribuído proporcionalmente** entre os demais — assim o score final
permanece interpretável mesmo com perfis incompletos.

| Critério                | Peso  | Como é medido                                                            |
|-------------------------|-------|--------------------------------------------------------------------------|
| **Profissão**           | 0.40  | Profissão canônica da vaga (`profissional_desejado`) × do profissional. Match exato = 1.0; profissões compatíveis (ex.: técnico de enfermagem × cuidador) = fração parcial; inviável = 0 |
| **Disponibilidade**     | 0.20  | Turnos da jornada da vaga (`08h às 18h` → manhã+tarde) × disponibilidade declarada |
| **Reputação**           | 0.15  | Média das avaliações (com peso por confiança de amostra: 1 avaliação não pesa como 10) + histórico de contratos concluídos |
| **Especialidade**       | 0.10  | Especialidades do profissional citadas no texto da vaga (descrição do serviço / diagnóstico) |
| **Registro verificado** | 0.05  | Selo `✓ Verificado` (1) / `⏳ Em análise` (2) / não validado (0)          |
| **Região**              | 0.10  | Mesma UF = 0.70 + 0.30 × sobreposição da sub-região; UF diferente = 0 (atendimento domiciliar é local) |

O nível resultante é `alto` (≥ 0.70), `medio` (≥ 0.45) ou `baixo`.

### Taxonomia de profissões

O profissional declara sua profissão no cadastro/edit de perfil. O backend é a
fonte da verdade — a lista vem de `GET /api/profissionais/profissoes`:

`cuidador` · `tecnico_enfermagem` · `enfermeiro` · `fisioterapeuta` ·
`terapeuta_ocupacional` · `psicologo` · `fonoaudiologo` · `nutricionista` ·
`medico` · `dentista`

O texto livre da vaga (`profissional_desejado`) é canonicalizado pela mesma
taxonomia, com sinônimos e radicais — "Cuidador de Idosos", "Acompanhante",
"Fisioterapia" e "Fisioterapeuta" caem no mesmo grupo.

### Endpoints

| Método | Rota                                    | Auth        | Descrição                                   |
|--------|-----------------------------------------|-------------|---------------------------------------------|
| GET    | `/api/profissionais/profissoes`          | —           | Taxonomia canônica de profissões            |
| GET    | `/api/vagas/:id/recomendar`              | contratante | Profissionais recomendados para a vaga      |
| GET    | `/api/profissionais/me/recomendar`       | profissional| Vagas recomendadas para o profissional logado |

Parâmetros: `limite` (1–50, default 10) e `minScore` (default 0.3).

A resposta traz o score, o nível e os **motivos estruturados** — cada motivo tem
um `codigo` estável (`profissao_exata`, `disponibilidade_parcial`,
`reputacao`, …) e um `detalhe` com os parâmetros de interpolação. É o frontend
que traduz o texto (`matching.reasons.*` em pt-BR / es / en), e não o backend —
por isso o mesmo payload serve aos três idiomas.

Profissionais que **já se candidataram** à vaga não são recomendados (não faz
sentido sugerir o mesmo candidato duas vezes).

### Filtros de listagem

`GET /api/vagas` aceita, além dos filtros originais: `tipoContrato`,
`remuneracaoTipo`, `jornadaEscala`, `ordenar` (`recentes` | `antigos` |
`remuneracao`), `limite` (1–200) e `offset`. A resposta inclui `total`,
`limite` e `offset` para paginação. A coluna de ordenação é validada contra
uma whitelist — um valor fora dela cai no default, nunca chega ao SQL.

---

## 🏗️ Arquitetura

```
Essencia_do_Cuidar/
├── backend/                    # API Node.js + Express + SQLite/Postgres + Socket.IO
│   ├── src/
│   │   ├── index.js            # Bootstrap do servidor + Socket.IO
│   │   ├── db/                 # driver.js (sqlite+pg) + migrator.js + index.js (facade)
│   │   ├── routes/             # auth, profissionais, vagas, candidaturas, mensagens, avaliacoes
│   │   ├── middleware/         # auth (JWT), validate (schema), security, async
│   │   └── services/
│   │       ├── netlify.js          # Cliente do webhook netlify.ai
│   │       └── registroValidator.js # Verificação estrutural de registros (regex)
│   ├── migrations/             # 0001_init.sql, 0002_registro_verificacao.sql
│   ├── data/                   # SQLite (essencia.db) — ignorado pelo git
│   ├── uploads/                # Diplomas — ignorado pelo git
│   └── package.json
│
├── frontend/                   # React 18 + Vite + TS + Tailwind + PWA + i18n
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/         # Navbar, Footer, Wizard, Chat, ProtectedRoute, LanguageSwitcher
│   │   ├── pages/              # Landing, Login, Cadastro, Vagas*, Dashboards*, ProfissionalPerfil
│   │   ├── context/            # AuthContext (JWT + localStorage)
│   │   ├── hooks/              # useUnreadCount, etc.
│   │   ├── i18n/               # i18next + locales (pt-BR, es, en)
│   │   ├── types/              # TypeScript types
│   │   ├── utils/              # api.ts (axios + interceptors), formatDate.ts
│   │   └── styles/             # index.css + paleta Tailwind
│   ├── public/                 # favicon.svg, PWA icons (192/512)
│   ├── vite.config.ts          # PWA + proxy /api → :4000
│   ├── tailwind.config.js      # Paleta serenity/emerald
│   └── package.json
│
├── scripts/
│   ├── smoke-test.sh           # 38 testes E2E (saúde, auth, vagas, candidatura, avaliação, registro)
│   ├── smoke-test-v2.sh        # 28 testes E2E das 6 features (PG, registros, Stripe, push, admin, i18n)
│   └── smoke-test-matching.sh  # 39 testes E2E do matching (score, pesos, auth, filtros)
├── .github/workflows/ci.yml    # CI: smoke tests (backend) + typecheck e build (frontend)
├── DEPLOY.md                   # Guia de deploy (Netlify + Render + Docker)
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
                        profissao, regiao,
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

| Método | Rota                          | Auth | Tipo            | Descrição                              |
|--------|-------------------------------|------|-----------------|----------------------------------------|
| GET    | `/api/health`                 | —    | —               | Healthcheck                            |
| POST   | `/api/auth/cadastro`          | —    | qualquer        | Cadastro (profissional ou contratante) |
| POST   | `/api/auth/login`             | —    | —               | Login → JWT                            |
| GET    | `/api/auth/me`                | JWT  | qualquer        | Usuário logado + detalhes              |
| GET    | `/api/profissionais/profissoes` | —  | —               | Taxonomia canônica de profissões      |
| GET    | `/api/profissionais/:id`      | —    | —               | Perfil público de profissional         |
| PUT    | `/api/profissionais/me`       | JWT  | profissional     | Atualiza perfil (normaliza registro)   |
| POST   | `/api/profissionais/me/diploma` | JWT | profissional   | Upload de diploma (multipart)          |
| POST   | `/api/profissionais/me/verificar-registro` | JWT | profissional | Valida formato do registro (regex) → selo |
| GET    | `/api/vagas`                  | —    | —               | Lista pública com filtros              |
| GET    | `/api/vagas/:id`              | —    | —               | Detalhe de uma vaga                    |
| GET    | `/api/vagas/:id/recomendar`    | JWT  | contratante     | Profissionais recomendados para a vaga |
| GET    | `/api/profissionais/me/recomendar` | JWT | profissional | Vagas recomendadas para o profissional |
| POST   | `/api/vagas`                  | JWT  | contratante     | Publica nova vaga + webhook            |
| GET    | `/api/vagas/contratante/minhas` | JWT | contratante   | Vagas do contratante logado            |
| PATCH  | `/api/vagas/:id/status`       | JWT  | contratante     | Pausar / reativar / fechar             |
| POST   | `/api/candidaturas`           | JWT  | profissional     | Candidatar-se + webhook                |
| GET    | `/api/candidaturas/profissional/minhas` | JWT | profissional | Minhas candidaturas            |
| GET    | `/api/candidaturas/vaga/:id`  | JWT  | contratante     | Candidatos de uma vaga                 |
| PATCH  | `/api/candidaturas/:id`       | JWT  | contratante     | Aceitar / recusar + webhook            |
| GET    | `/api/mensagens`              | JWT  | qualquer        | Lista de conversas                     |
| GET    | `/api/mensagens/:outroId`     | JWT  | qualquer        | Histórico de conversa                  |
| POST   | `/api/mensagens`              | JWT  | qualquer        | Enviar mensagem (HTTP fallback)        |
| POST   | `/api/avaliacoes`             | JWT  | contratante/profissional | Criar avaliação (candidatura aceita + vaga fechada) |
| GET    | `/api/avaliacoes/pendentes`   | JWT  | qualquer        | Lista de avaliações pendentes do usuário logado |
| GET    | `/api/avaliacoes/profissional/:id` | — | —          | Reviews públicas + stats do profissional |
| GET    | `/api/avaliacoes/candidatura/:id` | — | —            | Status de avaliação de uma candidatura |

### WebSocket
Conexão: `ws://localhost:4000` com auth `{ token: <jwt> }`.
Eventos:
- `mensagem:nova` (servidor → cliente) — payload `Mensagem`
- `mensagem:typing` (cliente ↔ cliente) — payload `{ de, para }`

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
25. ✅ Perfil público inclui stats de atuação (candidaturas, aceitas, concluídas)
26. ✅ Destinatário inexistente na mensagem → 404 **sem derrubar a API**
27. ✅ Candidatura a vaga inexistente → 404 sem derrubar a API

### Matching (39 testes — `scripts/smoke-test-matching.sh`)

28. ✅ Taxonomia de profissões retorna as 10 profissões canônicas
29. ✅ Recomendações por vaga retornam profissionais com score
30. ✅ **O critério de profissão pontua** (regressão do bug do Sprint 1)
31. ✅ Scores são distintos entre os candidatos e vêm ordenados
32. ✅ Motivos trazem `codigo` + `detalhe` (traduzíveis) e `nivel`
33. ✅ Match exato de profissão fica no topo
34. ✅ Profissional que já se candidatou não é recomendado
35. ✅ `minScore` e `limite` filtram a lista
36. ✅ Autorização: sem token → 401, tipo errado → 403, não-dono → 403
37. ✅ `PUT /profissionais/me` persiste `profissao` e `regiao`
38. ✅ Profissão fora da taxonomia → 400
39. ✅ Filtros expandidos de listagem + anti-injeção no `ordenar`

---

## 🛠️ Próximos passos

- [x] Migração para PostgreSQL em produção
- [x] Verificação de registros (CRM/COREN/CREFITO/CRP/CRN)
- [x] Pagamento via Pix / Stripe Connect (split 90/10)
- [x] Notificações push (Web Push / VAPID)
- [x] Painel administrativo (moderação, stats, users, verificações, pagamentos)
- [x] Internacionalização (pt-BR, es, en) com react-i18next

### Matching automático (branch `feat/matching-sprint-2`)

- [x] **Motor de matching reescrito** (`backend/src/services/matching.js`) — a
      versão anterior comparava a profissão da vaga com as *especialidades* do
      profissional, o que nunca pontuava e achatava todos os scores em ~0.5
- [x] **Profissão e região modeladas** (`profissionais_detalhes.profissao` /
      `.regiao`) — sem elas o matcher não tinha contra o que comparar
- [x] Taxonomia canônica de 10 profissões + sinônimos/radicais
- [x] Reputação com histórico de contratos concluídos e peso por amostra
- [x] Motivos estruturados e traduzidos (pt-BR / es / en)
- [x] UI de recomendações dos dois lados + edição de perfil
- [x] `scripts/smoke-test-matching.sh` (39 testes) e CI com typecheck

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

BASE=http://localhost:4000 bash scripts/smoke-test.sh          # 38/38
BASE=http://localhost:4000 bash scripts/smoke-test-v2.sh       # 28/28
BASE=http://localhost:4000 bash scripts/smoke-test-matching.sh # 39/39
```

O `npm run seed` é **determinístico**: os ids são sempre os mesmos, então
demos e testes podem referenciar ids fixos.

### Validação local completa
```bash
bash scripts/validate-e2e.sh
```
Sobe a API, roda as três suítes, faz o typecheck e o build do frontend, e
por fim checa que uma entrada inválida não derruba o servidor.

---

## 📄 Licença

MIT — construa em cima com cuidado. 💙
