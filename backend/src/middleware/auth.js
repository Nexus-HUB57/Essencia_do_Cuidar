import jwt from 'jsonwebtoken';
import db from '../db/driver.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // resolveUser é async agora; precisa do wrapper
    resolveUser(payload.id).then((user) => {
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
      // P4 — Verifica suspended_at em TODA request autenticada, não só no login.
      // Se admin suspendeu o user, tokens JWT emitidos anteriormente ficam imediatamente inválidos.
      if (user.suspended_at) {
        return res.status(403).json({
          error: 'Conta suspensa',
          motivo: user.suspended_reason || 'Violação dos termos de uso'
        });
      }
      req.user = user;
      next();
    }).catch(next);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

async function resolveUser(id) {
  return db.get(
    'SELECT id, tipo_usuario, nome, email, telefone, is_admin, suspended_at FROM users WHERE id = ?',
    [id]
  );
}

export function requireTipo(...tipos) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!tipos.includes(req.user.tipo_usuario)) {
      return res.status(403).json({ error: 'Acesso negado para este tipo de usuário' });
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, tipo: user.tipo_usuario, email: user.email },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}
