import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/driver.js';
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
 *
 * A1 completo — Se ENABLE_REFRESH_TOKENS=true, retorna access token (curto, 15min)
 * + refresh token (longo, 7d). Cliente deve usar access para API e refresh para
 * renovar via POST /api/auth/refresh quando access expirar.
 *
 * Default: ENABLE_REFRESH_TOKENS=false — retorna só access token (compat legado).
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

  // A1 completo — opt-in para refresh tokens via env
  if (process.env.ENABLE_REFRESH_TOKENS === 'true') {
    try {
      const { gerarTokenPacote } = await import('../services/auth-advanced.js');
      const pacote = gerarTokenPacote(safe);
      return res.json({
        user: safe,
        // Token de acesso (curto) — usar no header Authorization: Bearer
        token: pacote.accessToken,
        // Refresh token (longo) — usar em POST /api/auth/refresh
        refreshToken: pacote.refreshToken,
        expiresIn: pacote.expiresIn
      });
    } catch (err) {
      console.warn('[auth/login] refresh tokens indisponível, caindo para legado:', err.message);
    }
  }

  // Comportamento legado: só access token (7d)
  res.json({ user: safe, token });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authRequired, async (req, res) => {
  if (req.user.tipo_usuario === 'profissional') {
    const { buscarDetalhes } = await import('../utils/profissional.js');
    const detalhes = await buscarDetalhes(req.user.id);
    return res.json({ user: req.user, detalhes });
  }
  res.json({ user: req.user });
});

/**
 * A1 — POST /api/auth/refresh
 * Gera novo access token a partir de um refresh token válido.
 * Body: { refreshToken: string }
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken é obrigatório' });
  try {
    const { renovarAccessToken } = await import('../services/auth-advanced.js');
    const result = await renovarAccessToken(refreshToken);
    res.json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    });
  } catch (err) {
    return res.status(401).json({ error: 'Refresh token inválido', motivo: err.message });
  }
});

/**
 * A2 — POST /api/auth/logout
 * Revoga o access token atual (adiciona jti à blacklist).
 * Body: opcional { refreshToken: string } — se fornecido, também revoga.
 */
router.post('/logout', authRequired, async (req, res) => {
  try {
    const { revogarToken } = await import('../services/auth-advanced.js');
    if (req.tokenJti && req.tokenExp) {
      await revogarToken(req.tokenJti, req.user.id, req.tokenExp, 'logout');
    }
    // Se for fornecido refresh token no body, revoga também
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      const jwt = (await import('jsonwebtoken')).default;
      try {
        const payload = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret-trocar');
        if (payload.jti) {
          await revogarToken(payload.jti, req.user.id, payload.exp, 'logout');
        }
      } catch {}
    }
    res.json({ ok: true, mensagem: 'Logout efetuado. Token revogado.' });
  } catch (err) {
    console.warn('[auth/logout] erro:', err.message);
    res.json({ ok: true, mensagem: 'Logout efetuado (revogação best-effort).' });
  }
});

export default router;
