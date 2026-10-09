import jwt from 'jsonwebtoken';
import db from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar';

/**
 * Middleware que valida o header Authorization: Bearer <token>.
 * Anexa req.user com os dados do usuário autenticado.
 */
export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare('SELECT id, tipo_usuario, nome, email, telefone FROM users WHERE id = ?')
      .get(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/**
 * Restringe acesso a um tipo de usuário.
 *   requireTipo('profissional') ou requireTipo('profissional', 'contratante')
 */
export function requireTipo(...tipos) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!tipos.includes(req.user.tipo_usuario)) {
      return res.status(403).json({ error: 'Acesso negado para este tipo de usuário' });
    }
    next();
  };
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, tipo: user.tipo_usuario, email: user.email },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}
