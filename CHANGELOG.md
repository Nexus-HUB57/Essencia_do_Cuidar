# Changelog

Histórico das mudanças do projeto `Essência do Cuidar`.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionamento [SemVer](https://semver.org/lang/pt-BR/).

---

## [1.6.0] — 2026-11-23 — Sistema de ilustrações essência (fauna, flora, avatares, cenários)

### Adicionado — Ilustrações vetoriais da identidade dos roteiros

- **Novo módulo `frontend/src/components/ilustracoes/`** — todo o universo
  visual dos roteiros oficiais (verde sálvia, dourado, creme) virou SVG
  inline, com uma paleta única (`paleta.ts`) e um vocabulário só de
  animação (`index.css`):
  - **Flora**: `RamoBotanico` (ramo dourado em pares opostos, com `flip`),
    `DivisorBotanico` (ornamento central das artes), `VinhaCanto`,
    `FolhaSolta` e o emblema `CoracaoMaos` ("Cuidar com amor é a nossa
    essência" desenhado).
  - **Fauna**: `BeijaFlor` (asas em batida sutil), `Borboleta` e
    `Passarinho`.
  - **Avatares**: `AvatarCuidadora`, `AvatarEnfermeira`, `AvatarMedico`,
    `AvatarIdoso`, `AvatarIdosa` e `AvatarFamilia` — busto circular com
    recorte comum, dois tons de pele por prop `tom`, sem emojis.
  - **Cenários**: `CenarioDomiciliar` (cuidadora oferecendo chá à idosa),
    `CenarioHospitalar` (enfermeira, leito, soro e monitor), 
    `CenarioConsulta` (caminhada acompanhada até a unidade),
    `CenarioJardim` (beija-flor entre as flores) e `CenarioVazio`
    (sala quieta para estados sem registro).
- **Integrações**: hero da landing (vinhas nos cantos, beija-flor planando
  sobre o card, avatar da cuidadora no lugar do emoji 👵), divisor
  botânico entre seções, emblema no CTA final, faixas de cenário no topo
  dos cards de plantão (hospital = enfermagem, casa = cuidador),
  `EstadoVazio` nos 6 estados vazios dos dois painéis, 404 com beija-flor
  e emblema/divisor no "Como funciona".
- **Galeria viva** em `/ilustracoes` — documenta fauna, flora, avatares,
  cenários e paleta renderizando os componentes reais.
- **Acessibilidade**: decoração `aria-hidden`; ilustrações semânticas
  com `role="img"` + `<title>`; toda animação desliga em
  `prefers-reduced-motion: reduce` (media queries no `index.css`).
- **Tailwind**: nova paleta `essencia.*` (floresta/salvia/dourado/creme)
  e keyframes `flutuar/planar/oscilar/asas/brilhar`.

### Alterado — Otimização de payload e limpeza

- **25 MB fora do deploy**: os 6 avatares 3D `.glb` (4,1–4,6 MB cada) em
  `frontend/public/avatars/` nunca foram referenciados por nenhuma tela e
  eram copiados para o `dist` a cada build. Agora vivem em
  `arte-3d/avatares-glb/` (fora do caminho da Netlify, com o
  `manifest.json` e o `.netlifyignore` atualizados). Build do frontend:
  **~27 MB → 1,9 MB**.
- Cards de plantão usam `!p-0` + faixa de cenário em vez de padding fixo;
  nova chave i18n `plantoes.semCatalogo` em pt-BR/es/en para o estado
  vazio do catálogo.

### Verificado

- vitest **222 testes / 18 arquivos** · `smoke-test.sh` **57/57** ·
  `smoke-test-v2.sh` 31/31 · `smoke-test-matching.sh` 40/40 ·
  `smoke-test-custodia.py` jornada completa · `tsc --noEmit` limpo ·
  `vite build` ok · validação visual no navegador (landing, /plantoes,
  /ilustracoes, 404, dark-ready nos estados vazios).
- Observação de ambiente: com `DATABASE_URL` apontando para um Postgres
  ausente (sandbox local), o contador de webhooks do `smoke-test.sh`
  conecta no Postgres e marca as seções [14]/[26] como falha — CI e
  máquina local sem essa variável seguem 57/57.

---

## [1.5.0] — 2026-11-23 — Plantões via Mercado Pago e retirada de candidatura

### Adicionado — Plantões avulsos com checkout por Payment Link (Mercado Pago)

- **A oferta de plantão virou produto.** Seis plantões (enfermagem e cuidador
  de pessoa idosa, em 6/8/12 horas) estão à venda por Payment Link do
  Mercado Pago: cartão de crédito/débito, Pix e outros meios, com o
  checkout hospedado no MP. Os preços conferidos contra o checkout real de
  cada link (não presumidos): enfermagem 12/8/6h = R$ 250/200/150 e
  cuidador 12/8/6h = R$ 200/180/120.
- Novo `services/mercadopago-links.js` (catálogo) e `routes/plantoes.js`:
  `GET /api/plantoes` (catálogo público, com preço), filtro por
  `?familia=`, `POST /api/plantoes/:id/checkout`, `GET /api/plantoes/meus`,
  `GET /api/plantoes/status/:ref` e `POST /api/plantoes/status/:ref/confirmar`
  (só em modo mock). O preço aparece antes de qualquer cadastro — quem
  decide precisa ver o valor.
- Nova tabela `pagamentos_link` (SQLite e PostgreSQL) para reconciliar
  cada intenção de compra com o pagamento confirmado.
- O webhook do Mercado Pago agora reconhece pagamentos de plantão pela
  `external_reference` (`PLANTAO-...`) e marca como pago; os PDCs de
  custódia seguem no caminho de sempre, casados pelo `payment_id`.
  Idempotente: webhook repetido não duplica.
- Frontend: página `/plantoes` com filtro por família, botão Contratar que
  abre o checkout em nova aba e acompanha o status até confirmar, além do
  histórico "Meus plantões". Link na navbar e i18n em pt-BR, es e en.
- **Duas descobertas que definiram a implementação** (ambas verificadas
  contra o checkout real do MP): o short link `mpago.la/<slug>` responde
  301 e descarta a query string — a `external_reference` só sobrevive pela
  URL de redirect oficial (`/payment-link/v1/redirect?link-id=...`); e o
  MP recusa `notification_url` com host não público, por isso o webhook do
  link é configurado no painel do MP, não na query do checkout.
- Os 6 link-ids reais entram por env (`MERCADOPAGO_LINK_ENF_12H` …
  `MERCADOPAGO_LINK_CUI_6H`, ver DEPLOY.md); sem env, o fluxo roda com ids
  de demonstração para dev/teste.

### Adicionado — O profissional pode retirar a própria candidatura

- **Antes, uma candidatura era uma mão única.** O contratante recusava, mas
  o profissional não tinha como desistir — a única saída era esperar o
  fechamento da vaga. Agora existe `POST /api/candidaturas/:id/retirar`:
  o dono da candidatura (e só ele) move `pendente`/`visualizada` →
  `cancelada`, com auditoria completa na trilha de status (M11).
- Depois de `aceita` não se retira (a vaga fechou e o protocolo de custódia
  pode existir) nem depois de `recusada` (a decisão já foi do contratante):
  ambos viram 409. Repetir a retirada também — 409 idempotente.
- **E pode voltar atrás:** candidatar-se de novo à mesma vaga reativa a
  mesma linha (UNIQUE id_vaga+id_profissional preservado), voltando a
  `pendente` com a nova mensagem — a trilha de auditoria guarda o ciclo
  completo (`pendente→cancelada→pendente`).
- O contratante é avisado em tempo real (Socket.IO + web push) quando uma
  candidatura da vaga dele é retirada.
- UI: botão "Retirar candidatura" no painel do profissional e badge do novo
  status "Retirada". PostgreSQL ganhou o CHECK ampliado com o mesmo nome de
  constraint; SQLite recria a tabela em bancos antigos.

### Corrigido — Ícones oficiais do PWA e imagem social

- O PWA usava o `logo.jpg` de 640×640 como ícone único (e o `og:image`
  nem existia). Agora há `pwa-192x192.png`, `pwa-512x512.png`,
  `pwa-maskable-512x512.png` (arte dentro da zona segura de 80%),
  `apple-touch-icon.png` (180×180) e `og-image.png` 1200×630 com título,
  descrição e pilares, todos gerados da paleta real do app
  (serenity #4A90E2 → emerald #50E3C2). O `index.html` ganhou o bloco
  Open Graph/Twitter e ficou com um único `apple-touch-icon`.

### Verificado

- vitest **222 testes / 18 arquivos** (era 197/16)
- `smoke-test.sh` **57/57** (novas seções 28 e 29) · `smoke-test-v2.sh`
  31/31 · `smoke-test-matching.sh` 40/40 — as três na ordem do CI, com o
  banco re-semeado
- `tsc --noEmit` sem erros · `vite build` OK (11 entradas no precache,
  ícones incluídos)
- Teste de dicionário i18n garante as chaves novas nos três idiomas

---

## [1.4.2] — 2026-11-23 — Demonstração da custódia e correção de idioma

### Corrigido — O seletor de idioma mentia sobre o idioma atual

- **O seletor mostrava "🇧🇷 Português" numa tela em inglês.** O
  `i18next-browser-languagedetector` cacheia no localStorage o idioma
  **detectado** (`en-US`), não um dos três idiomas suportados. Como o
  `<select value="en-US">` não tinha opção correspondente, o navegador
  exibia a primeira — "Português" — enquanto a interface era renderizada
  em inglês.
- Novo `frontend/src/i18n/normalize.ts` centraliza a normalização
  (`en-US` → `en`, `es-419` → `es`, `pt_BR` → `pt-BR`, desconhecido →
  `pt-BR`). O detector, o seletor e o `<html lang>` passam a falar a mesma
  língua.
- `<html lang>` agora acompanha o idioma exibido. Antes ficava travado em
  `pt-BR`, o que enganava leitores de tela e buscadores.
- **Armadilha do i18next:** `nonExplicitSupportedLngs: true` faz o i18next
  tratar `"pt"` (sem região) como idioma suportado e tentar carregar um
  bundle inexistente — a tela inteira passava a mostrar chaves cruas em
  pt-BR. A variante segura usa `supportedLngs` **sem**
  `nonExplicitSupportedLngs`, já que o `convertDetectedLanguage` normaliza
  antes.
- Regressão coberta por `backend/tests/i18n-idioma.test.js`.

### Corrigido — A demonstração abria sem nenhum protocolo

- **O seed criava zero protocolos.** A custódia e o check-in/out estavam
  implementados e testados (`smoke-test-custodia.py` cobre a jornada
  inteira), mas quem abria o app via o painel de protocolos **vazio** —
  sem nenhuma pista de que a funcionalidade existia.
- O seed agora cria **5 protocolos** cobrindo cada estágio da jornada:
  `enviado` (PCM aguardando aceite), `em_custodia` (pagamento retido),
  `checkout_pendente` (check-in feito, aguardando check-out),
  `checkout_completo` (check-out dos dois lados, aguardando a liberação em
  72h) e `liberado` (custódia transferida ao profissional). Com check-ins,
  check-outs e registros de custódia correspondentes.
- As vagas novas (`vMaria4`, `vMaria5`) existem exatamente para isso: o
  matcher **não recomenda quem já se candidatou** à vaga, então usar as
  vagas do showcase de matching quebraria a vitrine do ranking.

### Verificado

- `smoke-test.sh` 38/38 · `smoke-test-v2.sh` 31/31 ·
  `smoke-test-matching.sh` 40/40 · `smoke-test-custodia.py` 29 checks
- vitest **197 testes / 16 arquivos** (era 191/15)
- `tsc --noEmit` sem erros · `vite build` OK
- Navegador: painel de protocolos renderiza os 5 estados em pt-BR/es/en
  sem erro de console

---

## [1.4.1] — 2026-11-12 — Correções de bugs

Revisão pós-entrega: bugs achados rodando o app de verdade (navegador +
API) e lendo o pipeline de deploy.

### Corrigido — Validação de entrada

- **Limite numérico comparado com o tamanho da string**: em regra
  `integer`/`number`, o `min`/`max` era aplicado sobre `value.length` quando
  o valor vinha como string. `nota: "999"` passava ("999".length = 3 ≤ 5) e
  só era barrado pelo CHECK constraint do banco — o cliente recebia **500**
  em vez de 400, e o check-out do contratante ficava pela metade.
  Afetava também `horas_trabalhadas: "-5"` e `valor_parcial_centavos`.
- Booleanos em campos numéricos (`nota: true` → `Number(true)` = 1) passaram
  como inteiros válidos.

### Corrigido — Mensagens de erro do frontend

- `getErrorMessage` checava `error` antes de `details`, e a resposta de
  validação é `{ error: 'Validação falhou', details: [...] }`: o motivo
  (qual campo falhou) **nunca** chegava ao usuário. O branch de `details`
  era código morto.

### Corrigido — UI de check-in/check-out

- O badge de status não refletia o check-in: o profissional que já havia
  chegado continuava vendo "Aguardando checkout". Agora mostra
  "Aguardando check-in" → "Em plantão".
- PCP, PCM e PDC são três linhas do **mesmo** plantão e apareciam juntos no
  dashboard com estados contraditórios (um "Em plantão", outro "Aguardando
  check-in"). O PCM agora só aparece enquanto não existe PDC — ou seja, na
  fase em que o profissional ainda tem o que decidir.
- O check-in passa a ser espelhado no PCP/PCM (como o estado de pagamento já
  era), então o dado é consistente em toda a trilha do protocolo.

### Corrigido — Deploy na Netlify

- **Causa raiz do app não atualizar: o secret `TOKEN_NETFLY` não está
  configurado (ou é inválido) no repositório.** O log do workflow mostra a
  sequência desde 07/11:
  ```
  Tentando deploy com TOKEN_NETFLY...
  Token falhou. Removendo NETLIFY_AUTH_TOKEN do env...
  Deploy URL: http://eclectic-salamander-821ce9.netlify.app
  ```
  O primeiro deploy (com token) falhava e o *fallback anônimo* publicava em
  um **site novo e aleatório** — o site real (`ecuidar.netlify.app`) seguia
  no ar com a versão antiga, e cada push poluía a conta com um site lixo.
- **Guard de deploy** (`scripts/netlify-deploy-guard.sh`, instalado como
  `node_modules/.bin/netlify` pelo `postinstall` do frontend): bloqueia o
  deploy anônimo — publicar num site aleatório é pior do que não publicar —
  e passa a mostrar no log da Actions o motivo real da falha, em vez de
  esconder o erro em `/tmp/deploy.log`.
- **Site linkado em `frontend/`** (`frontend/.netlify/state.json`): o
  workflow roda o CLI dentro de `frontend/`, onde não havia state.json —
  o CLI não achava o site alvo.
- **O secret documentado no cabeçalho (`CREDENCIAIS_NETFLY`) não era o
  usado** (`TOKEN_NETFLY`).
- A suíte vitest passou a rodar no gate do deploy (antes só os smoke
  tests rodavam).

> **Ação pendente do dono do repo:** definir `secrets.TOKEN_NETFLY` com um
> personal access token válido do Netlify (Settings → Secrets and variables
> → Actions), **ou** conectar o site ao repositório na Netlify
> (Site configuration → Build & deploy → Git) — essa segunda opção faz a
> Netlify construir e publicar a cada push, sem token no GitHub.

### Corrigido — CSP (as fontes da marca estavam bloqueadas)

A `Content-Security-Policy` do `netlify.toml` não liberava
`fonts.googleapis.com` (o `<link>` das fontes) nem `fonts.gstatic.com` (os
arquivos .woff2). O navegador bloqueava as duas coisas e o site renderizava
na fonte do sistema — o console acusava "violates Content Security Policy"
em todas as páginas.

### Corrigido — Features novas quebravam o CI

- `backend/src/app.js` usava `ragRouter` sem importar → `ReferenceError` na
  hora de subir o backend (o CI inteiro caía).
- `frontend/src/App.tsx` usava `<AssistenteRag />` sem importar → o
  `tsc --noEmit` falhava (`TS2304: Cannot find name 'AssistenteRag'`).

### Corrigido — PWA, Web Push e realtime

- **O Web Push nunca funcionou.** `src/main.tsx` registrava `/sw.js`, mas o
  arquivo não existia: em dev e na Netlify o `/sw.js` caía no fallback da SPA
  e voltava `index.html` com `Content-Type: text/html` — o Chrome recusava o
  script ("unsupported MIME type") e o registro falhava. Como
  `navigator.serviceWorker.ready` só resolve com um SW ativo, o botão
  "Ativar push" ficava **pendurado para sempre**, sem erro e sem retorno.
- **Mesmo com o SW corrigido, o push não apareceria.** O `vite-plugin-pwa`
  gerava um service worker Workbox, que faz precache mas **não tem handler
  de `push`**. Agora o handler vive em `frontend/public/push-handler.js` e é
  importado pelo SW de produção (`workbox.importScripts`) e pelo SW de dev
  (`frontend/public/sw.js`) — mesmo código nos dois ambientes.
- **`navigator.serviceWorker.ready` sem timeout.** Se o registro falhar de
  novo, o `await` trava o botão para sempre. Agora tem prazo de 8s e a
  falha aparece para o usuário (`notifications.enablePushError`).
- **`/manifest.webmanifest` não existia** (o `netlify.toml` e o `_headers`
  já referenciavam o arquivo) e o `<link rel="manifest">` faltava no
  `index.html`. O plugin passou a gerar o manifest em dev e em produção.
- **Realtime quebrado em desenvolvimento:** o `vite.config.ts` não tinha o
  proxy de `/socket.io` — o comentário no código affirmava que ele existia.
  O handshake caía no fallback da SPA (HTML) e o Socket.IO nunca conectava.
  O proxy foi adicionado em `server.proxy` e em `preview.proxy`.
- Registro do service worker duplicado (o plugin injetava `registerSW.js`
  e o `main.tsx` também registrava). Agora há uma fonte só: `main.tsx`.

### Corrigido — Deploy na Netlify

- **Deploy no site errado**: o CLI rodava em `frontend/`, onde não existe
  `.netlify/state.json` (o link do site está na raiz do repo). Sem
  `--site`, o CLI pode **criar um site novo** em vez de atualizar o site
  linkado — deploy duplicado, com o app antigo continuando no ar.
  Agora o siteId é lido do `state.json` e passado explicitamente.
- **Fallback anônimo removido**: `--allow-anonymous` também cria um site
  novo e não exige token — o deploy "passaria" sem atualizar o app de
  verdade. Agora, token ausente = falha explícita.
- O secret documentado no cabeçalho (`CREDENCIAIS_NETFLY`) não era o usado
  (`TOKEN_NETFLY`).
- A suíte vitest passou a rodar no gate do deploy (antes só os smoke
  tests rodavam).

### Adicionado — Ferramentas de verificação

- `scripts/browser-check.py` — varre as telas do app num navegador real
  coletando `console.error`, `pageerror` e requisições 4xx/5xx
- `scripts/checkin-ui-check.py` — verifica visualmente o fluxo de
  check-in/check-out (badges e botões no estado certo) e salva screenshots
- `scripts/signup-flow-check.py` — percorre o wizard de cadastro de
  profissional e a candidatura a uma vaga no navegador real
- `scripts/pwa-check.py` — verifica a camada PWA/realtime: `/sw.js` servido
  como JavaScript (não HTML), service worker registrado e ativo, handler de
  push presente no SW efetivo, manifest válido e handshake do Socket.IO
  passando pelo mesmo origin

### Testes

- `tests/validate.test.js` (7) — limites numéricos do `validateBody`
- `tests/protocolos.test.js` (+2) — nota fora da faixa volta 400 (não 500);
  check-in espelhado nos protocolos irmãos
- Total: **185 testes** (145 → 185)

---

## [1.4.0] — 2026-11-12 — Check-in/Check-out, custódia e matching

Revisão de ponta a ponta das três linhas que sustentam o marketplace:
matching de vagas, custódia de pagamentos e check-in/check-out de plantão.

### Adicionado — Check-in / Check-out de plantão

- `protocolo_checkins` — ledger append-only de chegadas (timestamp, latitude/
  longitude opcional, observação, flag `implicito`)
- `POST /api/protocolos/:id/checkin` — profissional registra a chegada; o
  contratante confirma a presença depois
- `GET /api/protocolos/:id/checkins` — histórico de presenças do protocolo
- Colunas `checkin_profissional_em` / `checkin_contratante_em` em `protocolos`
- UI: botão de check-in com captura opcional de geolocalização, timeline de
  chegadas no painel de protocolos, modal de avaliação por estrelas no
  check-out (pt-BR / es / en)

### Corrigido — Custódia de pagamentos

- **Custódia destruída por prazo**: `buscarProtocolosExpirados()` incluía os
  estados pós-pagamento, então um protocolo já pago era marcado `expirado`
  quando passava do prazo — a custódia sumia sem reembolso nem liberação.
  Agora só estados pré-pagamento (`pendente`, `enviado`) expiram, e o
  `expira_em` é zerado no momento do pagamento
- **Liberação sem transferência**: `liberarPagamento()` apenas mudava o
  status no banco — o dinheiro nunca saía da plataforma. Agora executa o
  Transfer do Stripe Connect (quando o pagamento foi pelo Stripe), grava o
  `stripe_transfer_id` e é idempotente
- **Ordem do check-out invertida**: o contratante podia fechar o plantão
  antes do profissional, deixando o protocolo em `checkout_contratante` —
  estado que nenhum cron processa, com o pagamento retido para sempre
- **Dois caminhos de pagamento**: `POST /api/pagamentos` criava um pagamento
  avulso, fora da custódia (sem check-in/check-out e sem liberação). Agora
  delega ao protocolo (PDC) quando ele existe
- Check-out do profissional pressupõe check-in; protocolos anteriores à
  feature recebem check-in implícito (marcado na auditoria)

### Corrigido — Matching

- **Reputação nunca acumulava**: a nota do checkout ficava só em
  `protocolo_checkouts`, mas o motor de matching lê `avaliacoes`. Quem
  completava plantões bem avaliados continuava com reputação 0. O checkout
  do contratante agora grava a avaliação
- **"Atendimentos concluídos" contava aceitações**: a vaga é fechada quando o
  contratante aceita a candidatura — antes de qualquer atendimento. Um
  profissional que aceitava 20 matchings e abandonava todos recebia nota
  máxima de histórico. Agora o histórico conta protocolos concluídos
  (`checkout_completo` / `liberado` / `liberado_parcial`), com um termo de
  legado para linhas sem protocolo

### Corrigido — Portabilidade PostgreSQL

- O código é escrito em dialeto SQLite e roda em PostgreSQL em produção.
  `datetime('now')` (71 ocorrências em 12 arquivos) e `INSERT OR IGNORE`
  (3 ocorrências) não existem no PG — o fluxo inteiro de custódia quebrava
  no primeiro `datetime()` executado
- `backend/src/db/sql-dialect.js` — tradutor SQLite → PostgreSQL, aplicado no
  driver do PG. Mantém o formato de timestamp byte-compatível com o SQLite
  (`YYYY-MM-DD HH:MM:SS` em UTC), de modo que o frontend não muda
- `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`

### Adicionado — Testes

- `tests/protocolos.test.js` (19) — fluxo completo de check-in/check-out,
  idempotência, autorização, ponte de reputação, garantias de custódia,
  caminho único de pagamento
- `tests/sql-dialect.test.js` (10) — tradutor e varredura de todo o `src/`
- `tests/sql-postgres-runtime.test.js` (2) — valida o SQL realmente executado
  contra o parser do PostgreSQL (`pgsql-ast-parser`)
- Total: 176 testes (145 → 176)

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
