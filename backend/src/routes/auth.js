import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authRequired, signToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

const cadastroSchema = {
  tipo_usuario: { required: true, type: 'enum', values: ['profissional', 'contratante'] },
  nome:         { required: true, type: 'string', min: 2, max: 120 },
  email:        { required: true, type: 'email' },
  senha:        { required: true, type: 'string', min: 6, max: 72 },
  telefone:     { type: 'string', min: 8, max: 30 }
};

const loginSchema = {
  email: { required: true, type: 'email' },
  senha: { required: true, type: 'string', min: 6 }
};

/**
 * POST /api/auth/cadastro
 * Cria usuário (profissional ou contratante). Para profissionais, cria
 * também o registro em profissionais_detalhes com diploma/registro vazios
 * (preenchidos depois via /api/profissionais/me).
 */
router.post('/cadastro', validateBody(cadastroSchema), (req, res) => {
  const { tipo_usuario, nome, email, senha, telefone } = req.body;
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });

  const senha_hash = bcrypt.hashSync(senha, 10);
  const info = db.prepare(`
    INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
    VALUES (?, ?, ?, ?, ?)
  `).run(tipo_usuario, nome.trim(), email.toLowerCase(), senha_hash, telefone || null);

  if (tipo_usuario === 'profissional') {
    db.prepare(`
      INSERT INTO profissionais_detalhes (id_user) VALUES (?)
    `).run(info.lastInsertRowid);
  }

  const user = db.prepare(
    'SELECT id, tipo_usuario, nome, email, telefone FROM users WHERE id = ?'
  ).get(info.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ user, token });
});

/**
 * POST /api/auth/login
 */
router.post('/login', validateBody(loginSchema), (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (!bcrypt.compareSync(senha, user.senha_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const safe = { id: user.id, tipo_usuario: user.tipo_usuario, nome: user.nome, email: user.email, telefone: user.telefone };
  const token = signToken(safe);
  res.json({ user: safe, token });
});

/**
 * GET /api/auth/me  — usuário logado + extras conforme o tipo
 */
router.get('/me', authRequired, (req, res) => {
  if (req.user.tipo_usuario === 'profissional') {
    const detalhes = db.prepare('SELECT * FROM profissionais_detalhes WHERE id_user = ?').get(req.user.id);
    return res.json({ user: req.user, detalhes });
  }
  res.json({ user: req.user });
});

export default router;
