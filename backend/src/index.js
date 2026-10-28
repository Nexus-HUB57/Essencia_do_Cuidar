import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import fs from 'fs';

import db from './db/driver.js';
import authRouter from './routes/auth.js';
import profissionaisRouter from './routes/profissionais.js';
import vagasRouter from './routes/vagas.js';
import candidaturasRouter from './routes/candidaturas.js';
import mensagensRouter from './routes/mensagens.js';
import pagamentosRouter from './routes/pagamentos.js';
import pushRouter from './routes/push.js';
import adminRouter from './routes/admin.js';
import i18nRouter from './routes/i18n.js';
import avaliacoesRouter from './routes/avaliacoes.js';
import favoritosRouter from './routes/favoritos.js';
import notificacoesRouter from './routes/notificacoes.js';
import protocolosRouter from './routes/protocolos.js';
import { securityHeaders, apiLimiter, authLimiter } from './middleware/security.js';
import { listarProfissoes, UFS_VALIDAS } from './services/profissoes.js';
import { getOpenApiSpec, getSwaggerUIHtml } from './services/openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

// P2 — Em produção, JWT_SECRET é obrigatório. Abortar startup se ausente ou fallback.
if (NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-trocar')) {
  console.error('[FATAL] JWT_SECRET não configurado em produção. Gere com: openssl rand -hex 32');
  console.error('       Defina a variável JWT_SECRET antes de subir o servidor.');
  process.exit(1);
}

// Inicializa o schema do driver escolhido
await db.initSchema();

// A1/A2 — Inicializa o módulo de auth avançada (cria tabela token_blacklist se não existir)
try {
  const { initAuthAdvanced } = await import('./services/auth-advanced.js');
  await initAuthAdvanced();
} catch (err) {
  console.warn('[startup] auth-advanced indisponível:', err.message);
}

// Cron jobs internos (opcional via ENABLE_INTERNAL_CRON=true).
// Em multi-instância, prefira usar cron jobs externos (k8s CronJob, Render Cron).
try {
  const { startInternalCron } = await import('./services/cron-internal.js');
  startInternalCron();
} catch (err) {
  console.warn('[startup] cron-internal indisponível:', err.message);
}

// M10 — Inicializa FTS (busca textual) — best-effort
try {
  const { initFTS } = await import('./services/search-fts.js');
  await initFTS();
} catch (err) {
  console.warn('[startup] FTS indisponível, usando LIKE:', err.message);
}

const app = express();
app.use(securityHeaders);
app.use(cors({ origin: FRONTEND_URL.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));

// U3 — Uploads com auth (era público antes — qualquer um podia baixar diplomas se soubesse o filename)
// Agora só usuários autenticados podem acessar /uploads/. O admin pode ver qualquer um,
// o profissional pode ver apenas o próprio diploma, o contratante pode ver diplomas
// de candidatos das suas vagas.
//
// Se AUTH_UPLOADS=false no env, mantém o comportamento antigo (público) para retrocompat.
const AUTH_UPLOADS = process.env.AUTH_UPLOADS !== 'false';
if (!AUTH_UPLOADS) {
  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
} else {
  // Versão autenticada: serve o arquivo só se o user tem permissão
  const uploadsDir = path.resolve(__dirname, '../uploads');
  app.use('/uploads', async (req, res, next) => {
    // Verifica auth
    const { authRequired } = await import('./middleware/auth.js');
    // Wrap para capturar resposta
    let authed = false;
    let user = null;
    await new Promise((resolve) => {
      const fakeRes = {
        status: (code) => ({ json: (data) => { resolve({ code, data }); } }),
        json: (data) => { resolve({ code: 200, data }); }
      };
      authRequired(req, fakeRes, () => { authed = true; user = req.user; resolve({ code: 200 }); });
    });
    if (!authed) {
      return res.status(401).json({ error: 'Autenticação necessária para acessar uploads' });
    }
    // Extrai path do arquivo e verifica existência ANTES de checar permissão
    // (evita vazar info sobre quais arquivos existem)
    const requestedPath = decodeURIComponent(req.path);
    const filePath = path.join(uploadsDir, requestedPath);
    // Anti path traversal: garante que o caminho fica dentro de uploadsDir
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    // Arquivo existe — agora verifica permissão
    // Admin pode ver qualquer arquivo
    if (user.is_admin) return next();
    // Profissional só vê próprio diploma (filename começa com `prof<id>_`)
    if (user.tipo_usuario === 'profissional') {
      const fn = requestedPath.split('/').pop() || '';
      if (fn.startsWith(`prof${user.id}_`)) return next();
      return res.status(403).json({ error: 'Acesso negado' });
    }
    // Contratante: pode ver diplomas de candidatos das suas vagas
    if (user.tipo_usuario === 'contratante') {
      const fn = requestedPath.split('/').pop() || '';
      const match = fn.match(/^prof(\d+)_/);
      if (match) {
        const profId = Number(match[1]);
        const candidatura = await db.get(
          `SELECT 1 FROM candidaturas c
            JOIN vagas v ON v.id = c.id_vaga
           WHERE c.id_profissional = ? AND v.id_contratante = ? LIMIT 1`,
          [profId, user.id]
        );
        if (candidatura) return next();
      }
      return res.status(403).json({ error: 'Acesso negado — você só pode ver diplomas de profissionais que se candidataram às suas vagas' });
    }
    return res.status(403).json({ error: 'Acesso negado' });
  }, express.static(uploadsDir));
}

app.get('/api/health', async (req, res) => {
  const ts = new Date().toISOString();
  // Tenta uma query leve no DB para confirmar que o driver está vivo.
  // Falha no DB → retorna 503 (Service Unavailable) para healthchecks
  // externos (Render, Railway, Docker, k8s) marcarem a instância como
  // unhealthy em vez de continuar recebendo tráfego.
  let dbOk = false;
  let dbError = null;
  try {
    const row = await db.get('SELECT 1 AS ok');
    dbOk = row?.ok === 1;
  } catch (e) {
    dbError = e.message;
  }
  const status = dbOk ? 200 : 503;
  // Item 10 — Emite alerta se DB cair (503)
  if (!dbOk) {
    try {
      const { emitirAlerta } = await import('./services/alerting.js');
      emitirAlerta('db_down', { erro: dbError, driver: db.driver });
    } catch {/* best-effort */}
  }
  res.status(status).json({
    ok: dbOk,
    service: 'essencia-do-cuidar',
    timestamp: ts,
    db: {
      driver: db.driver,
      reachable: dbOk,
      error: dbError
    }
  });
});

/**
 * M2/M3 — Endpoint público que lista profissões suportadas e UFs válidas.
 * Usado pelo frontend para autocomplete no wizard de cadastro e form de vaga.
 */
app.get('/api/profissoes', (req, res) => {
  res.json({
    profissoes: listarProfissoes(),
    ufs: UFS_VALIDAS
  });
});

/**
 * P10 — OpenAPI/Swagger docs
 * GET /api/openapi.json — JSON OpenAPI 3.0 spec (para importar em ferramentas)
 * GET /api/docs         — Swagger UI interativo (HTML carrega UI via CDN)
 */
app.get('/api/openapi.json', (req, res) => {
  res.json(getOpenApiSpec());
});
app.get('/api/docs', (req, res) => {
  res.type('html').send(getSwaggerUIHtml(getOpenApiSpec()));
});

// Rate limit mais agressivo em /api/auth/* (anti brute-force em login/cadastro)
app.use('/api/auth', authLimiter, authRouter);
// Rate limit geral nas demais APIs
app.use('/api', apiLimiter);

// Webhook do Mercado Pago — SEM rate limit e SEM parser json (precisa do raw body para validar assinatura)
app.post('/api/webhooks/mercadopago', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const { processarWebhook } = await import('./services/mercadopago.js');
    const result = await processarWebhook(req.body);
    console.log('[mercadopago-webhook]', result);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error('[mercadopago-webhook] erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/profissionais', profissionaisRouter);
app.use('/api/vagas', vagasRouter);
app.use('/api/candidaturas', candidaturasRouter);
app.use('/api/mensagens', mensagensRouter);
app.use('/api/pagamentos', pagamentosRouter);
app.use('/api/push', pushRouter);
app.use('/api/admin', adminRouter);
app.use('/api/i18n', i18nRouter);
app.use('/api/avaliacoes', avaliacoesRouter);
app.use('/api/favoritos', favoritosRouter);
app.use('/api/notificacoes', notificacoesRouter);
app.use('/api/protocolos', protocolosRouter);

// SPA fallback
const distPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[essencia-do-cuidar] servindo frontend estático de ${distPath}`);
}

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.use((err, req, res, _next) => {
  // P3 — Loga erro internamente, mas em produção NÃO expõe detalhe ao cliente
  console.error('[erro]', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: 'Erro interno do servidor',
    detalhe: isProd ? undefined : err.message
  });
});

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: FRONTEND_URL.split(','), credentials: true }
});
globalThis.__io = io;

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Token ausente'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  console.log(`[socket] user ${socket.userId} conectado (${socket.id})`);

  socket.on('mensagem:typing', ({ para }) => {
    if (para) io.to(`user:${para}`).emit('mensagem:typing', { de: socket.userId });
  });

  socket.on('disconnect', () => {
    console.log(`[socket] user ${socket.userId} desconectado`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[essencia-do-cuidar] backend rodando em http://localhost:${PORT}`);
  console.log(`[essencia-do-cuidar] CORS liberado para ${FRONTEND_URL}`);
  console.log(`[essencia-do-cuidar] DB driver: ${db.driver}`);
});
