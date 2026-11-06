/**
 * Bootstrap de rede: app Express + Socket.IO.
 *
 * A construção do app vive em `src/app.js` (importável pelos testes).
 * Aqui só abrimos o socket e subimos o servidor.
 */
import 'dotenv/config';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

import db from './db/driver.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

const app = await createApp();

// Guardas de processo. O default do Node >= 15 e terminar o processo em
// qualquer unhandledRejection — um handler async sem try/catch derrubava o
// backend inteiro. Com createRouter() (middleware/async.js) as rejeicoes
// chegam ao error handler de app.js; estas guardas sao a rede final para o
// que escapar (bug em codigo fora de request, timer, etc).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Nao sair: o estado pode estar inconsistente, mas derrubar o servico por
  // uma excecao nao tratada e pior. Em producao, o orquestrador (Render)
  // reinicia o container se o processo realmente morrer.
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

export { app, server, io };
