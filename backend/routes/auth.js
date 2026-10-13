import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, transaction } from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
// body: { tipo_usuario, nome, email, senha, telefone, ...detalhes }
router.post('/register', async (req, res) => {
  const { tipo_usuario, nome, email, senha, telefone } = req.body || {};

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

  const tx = transaction(() => {
    const info = db.prepare(`
      INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
      VALUES (?, ?, ?, ?, ?)
    `).run(tipo_usuario, nome, email, senha_hash, telefone || null);
    const userId = info.lastInsertRowid;

    if (tipo_usuario === 'profissional') {
      const d = req.body.detalhes || {};
      db.prepare(`
        INSERT INTO profissionais_detalhes
          (id_user, diploma_url, registro_conselho, especialidades, disponibilidade)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        d.diploma_url || null,
        d.registro_conselho || null,
        JSON.stringify(d.especialidades || []),
        JSON.stringify(d.disponibilidade || {})
      );
    }
    return userId;
  });

  const userId = tx();
  const token = signToken({ id: userId, tipo_usuario, nome, email });
  res.status(201).json({ token, user: { id: userId, tipo_usuario, nome, email } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
