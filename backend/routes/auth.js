import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, transaction } from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { uploadForRegister, persistPendingUploads } from '../middleware/upload.js';
import { json } from '../middleware/body.js';

const router = Router();

// POST /api/auth/register
// Aceita multipart/form-data com campos:
//   texto: tipo_usuario, nome, email, senha, telefone, registro_conselho,
//          especialidades (JSON string), disponibilidade (JSON string)
//   arquivo: diploma (PDF/JPG/PNG/WEBP, até 10MB), registro_conselho_doc
// Também aceita application/json (sem arquivos) — campos idênticos.
router.post('/register', (req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.startsWith('multipart/form-data')) return uploadForRegister(req, res, next);
  return json(req, res, next);
}, async (req, res) => {
  const b = req.body || {};
  const files = req.files || {};
  const { tipo_usuario, nome, email, senha, telefone } = b;

  if (!tipo_usuario || !['profissional', 'contratante'].includes(tipo_usuario)) {
    return res.status(400).json({ error: 'tipo_usuario deve ser "profissional" ou "contratante"' });
  }
  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'nome, email e senha são obrigatórios' });
  }
  if (String(senha).length < 6) {
    return res.status(400).json({ error: 'senha deve ter ao menos 6 caracteres' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'email inválido' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email já cadastrado' });

  const senha_hash = await bcrypt.hash(senha, 10);

  // Helpers de parsing seguro para campos que podem vir como JSON string
  function safeJSON(v, fallback) {
    if (v == null || v === '') return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return fallback; }
  }

  const tx = transaction(() => {
    const info = db.prepare(`
      INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
      VALUES (?, ?, ?, ?, ?)
    `).run(tipo_usuario, nome, email, senha_hash, telefone || null);
    const userId = info.lastInsertRowid;

    if (tipo_usuario === 'profissional') {
      const persisted = persistPendingUploads(userId, files);
      const diploma = persisted.diploma;
      const registro = persisted.registro;
      const especialidades = safeJSON(b.especialidades, []);
      const disponibilidade = safeJSON(b.disponibilidade, {});

      db.prepare(`
        INSERT INTO profissionais_detalhes
          (id_user, diploma_url, diploma_original_name, diploma_uploaded_at,
           registro_conselho, registro_conselho_url, registro_conselho_original_name, registro_conselho_uploaded_at,
           especialidades, disponibilidade)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        diploma?.url || null,
        diploma?.originalName || null,
        diploma?.uploadedAt || null,
        b.registro_conselho || null,
        registro?.url || null,
        registro?.originalName || null,
        registro?.uploadedAt || null,
        JSON.stringify(Array.isArray(especialidades) ? especialidades : []),
        JSON.stringify(disponibilidade && typeof disponibilidade === 'object' ? disponibilidade : {})
      );
    }
    return userId;
  });

  const userId = tx();
  const token = signToken({ id: userId, tipo_usuario, nome, email });
  res.status(201).json({ token, user: { id: userId, tipo_usuario, nome, email } });
});

// POST /api/auth/login
router.post('/login', json, async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'credenciais inválidas' });

  const ok = await bcrypt.compare(senha, user.senha_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });

  const token = signToken({ id: user.id, tipo_usuario: user.tipo_usuario, nome: user.nome, email: user.email });
  res.json({ token, user: { id: user.id, tipo_usuario: user.tipo_usuario, nome: user.nome, email: user.email } });
});

// GET /api/auth/me
router.get('/me', authRequired, (req, res) => {
  const u = db.prepare('SELECT id, tipo_usuario, nome, email, telefone FROM users WHERE id = ?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'usuário não encontrado' });
  res.json(u);
});

export default router;
