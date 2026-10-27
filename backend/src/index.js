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
import { securityHeaders, apiLimiter, authLimiter } from './middleware/security.js';
import { wrapRouter } from './middleware/async.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

// Último recurso: uma rejeição que escapou de qualquer handler vira log,
// não o fim do processo. Sem isso, uma única requisição malformada derrubava
// a API inteira e todas as requisições passavam a responder "connection
// refused" até alguém reiniciar o serviço.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// P2 — Em produção, JWT_SECRET é obrigatório. Abortar startup se ausente ou fallback.
if (NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-trocar')) {
  console.error('[FATAL] JWT_SECRET não configurado em produção. Gere com: openssl rand -hex 32');
  console.error('       Defina a variável JWT_SECRET antes de subir o servidor.');
  process.exit(1);
}

// Inicializa o schema do driver escolhido
await db.initSchema();

const app = express();
app.use(securityHeaders);
app.use(cors({ origin: FRONTEND_URL.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

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

// Rate limit mais agressivo em /api/auth/* (anti brute-force em login/cadastro)
app.use('/api/auth', authLimiter, authRouter);
// Rate limit geral nas demais APIs
app.use('/api', apiLimiter);
// Os handlers das rotas são `async`. O Express 4 não captura rejeições de
// Promise — elas viravam unhandledRejection e derrubavam o processo inteiro
// (Node >= 15 aborta por padrão). wrapRouter converte qualquer erro async em
// next(err), que o error handler abaixo transforma em 500 sem derrubar a API.
app.use('/api/profissionais', wrapRouter(profissionaisRouter));
app.use('/api/vagas', wrapRouter(vagasRouter));
app.use('/api/candidaturas', wrapRouter(candidaturasRouter));
app.use('/api/mensagens', wrapRouter(mensagensRouter));
app.use('/api/pagamentos', wrapRouter(pagamentosRouter));
app.use('/api/push', wrapRouter(pushRouter));
app.use('/api/admin', wrapRouter(adminRouter));
app.use('/api/i18n', wrapRouter(i18nRouter));
app.use('/api/avaliacoes', wrapRouter(avaliacoesRouter));
app.use('/api/favoritos', wrapRouter(favoritosRouter));
app.use('/api/notificacoes', wrapRouter(notificacoesRouter));

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
