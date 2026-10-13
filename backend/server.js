import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js'; // inicializa schema
import authRoutes from './routes/auth.js';
import profissionaisRoutes from './routes/profissionais.js';
import vagasRoutes from './routes/vagas.js';
import candidaturasRoutes from './routes/candidaturas.js';
import chatRoutes from './routes/chat.js';
import webhookRoutes from './routes/webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  credentials: false,
}));
app.use(express.json({ limit: '2mb' }));

// uploads de diploma servidos em /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'essencia-do-cuidar-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/profissionais', profissionaisRoutes);
app.use('/api/vagas', vagasRoutes);
app.use('/api/candidaturas', candidaturasRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/webhook', webhookRoutes);

// error handler
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'erro interno' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🩺 Essência do Cuidar API rodando em http://localhost:${PORT}`);
});
