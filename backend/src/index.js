import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';

import './db/index.js'; // inicializa schema
import authRouter from './routes/auth.js';
import profissionaisRouter from './routes/profissionais.js';
import vagasRouter from './routes/vagas.js';
import candidaturasRouter from './routes/candidaturas.js';
import mensagensRouter from './routes/mensagens.js';
import avaliacoesRouter from './routes/avaliacoes.js';
import favoritosRouter from './routes/favoritos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

const app = express();
app.use(cors({ origin: FRONTEND_URL.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Servir uploads (diplomas)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'essencia-do-cuidar', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/profissionais', profissionaisRouter);
app.use('/api/vagas', vagasRouter);
app.use('/api/candidaturas', candidaturasRouter);
app.use('/api/mensagens', mensagensRouter);
app.use('/api/avaliacoes', avaliacoesRouter);
app.use('/api/favoritos', favoritosRouter);

// Serve o build do frontend em produção (quando dist/ existe).
// Habilita deploy single-port — útil para demos e ambientes pequenos.
const distPath = path.resolve(__dirname, '../../frontend/dist');
import fs from 'fs';
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: qualquer rota que não seja /api ou /uploads devolve index.html
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[essencia-do-cuidar] servindo frontend estático de ${distPath}`);
}

// 404 genérico
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Handler de erros
app.use((err, req, res, _next) => {
  console.error('[erro]', err);
  res.status(500).json({ error: 'Erro interno do servidor', detalhe: err.message });
});

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: FRONTEND_URL.split(','), credentials: true }
});
globalThis.__io = io;

// Autenticação de socket via JWT passado no handshake
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
});
