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
import { securityHeaders, apiLimiter, authLimiter } from './middleware/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

// Inicializa o schema do driver escolhido
await db.initSchema();

const app = express();
app.use(securityHeaders);
app.use(cors({ origin: FRONTEND_URL.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'essencia-do-cuidar',
    timestamp: new Date().toISOString(),
    db: db.driver
  });
});

// Rate limit mais agressivo em /api/auth/* (anti brute-force em login/cadastro)
app.use('/api/auth', authLimiter, authRouter);
// Rate limit geral nas demais APIs
app.use('/api', apiLimiter);
app.use('/api/profissionais', profissionaisRouter);
app.use('/api/vagas', vagasRouter);
app.use('/api/candidaturas', candidaturasRouter);
app.use('/api/mensagens', mensagensRouter);
app.use('/api/pagamentos', pagamentosRouter);
app.use('/api/push', pushRouter);
app.use('/api/admin', adminRouter);
app.use('/api/i18n', i18nRouter);
app.use('/api/avaliacoes', avaliacoesRouter);

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
  console.error('[erro]', err);
  res.status(500).json({ error: 'Erro interno do servidor', detalhe: err.message });
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
