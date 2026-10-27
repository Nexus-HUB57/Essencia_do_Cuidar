import express from 'express';
import { createRouter } from '../middleware/async.js';
import bcrypt from 'bcryptjs';
import db from '../db/driver.js';
import { authRequired, signToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = createRouter(express);

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
 */
router.post('/cadastro', validateBody(cadastroSchema), async (req, res) => {
  const { tipo_usuario, nome, email, senha, telefone } = req.body;
  const emailLower = email.toLowerCase();
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [emailLower]);
  if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });

  const senha_hash = bcrypt.hashSync(senha, 10);
  const info = await db.run(
    `INSERT INTO users (tipo_usuario, nome, email, senha_hash, telefone)
     VALUES (?, ?, ?, ?, ?)`,
    [tipo_usuario, nome.trim(), emailLower, senha_hash, telefone || null]
  );

  if (tipo_usuario === 'profissional') {
    await db.run('INSERT INTO profissionais_detalhes (id_user) VALUES (?)', [info.lastInsertRowid]);
  }

  const user = await db.get(
    'SELECT id, tipo_usuario, nome, email, telefone, is_admin FROM users WHERE id = ?',
    [info.lastInsertRowid]
  );
  const token = signToken(user);
  res.status(201).json({ user, token });
});

/**
 * POST /api/auth/login
 */
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, senha } = req.body;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (user.suspended_at) return res.status(403).json({ error: 'Conta suspensa', motivo: user.suspended_reason });
  if (!bcrypt.compareSync(senha, user.senha_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const safe = {
    id: user.id, tipo_usuario: user.tipo_usuario, nome: user.nome,
    email: user.email, telefone: user.telefone, is_admin: user.is_admin
  };
  const token = signToken(safe);
  res.json({ user: safe, token });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authRequired, async (req, res) => {
  if (req.user.tipo_usuario === 'profissional') {
    const detalhes = await db.get('SELECT * FROM profissionais_detalhes WHERE id_user = ?', [req.user.id]);
    return res.json({ user: req.user, detalhes });
  }
  res.json({ user: req.user });
});

export default router;
