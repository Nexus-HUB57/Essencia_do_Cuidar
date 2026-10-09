import express from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

/**
 * GET /api/mensagens  — listagem de conversas do usuário logado
 * (apenas metadados: último msg, contagem não lidas, etc.)
 */
router.get('/', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, u.nome AS outro_nome
      FROM mensagens m
      JOIN users u ON u.id = CASE
        WHEN m.id_remetente = ? THEN m.id_destinatario
        ELSE m.id_remetente
      END
     WHERE m.id_remetente = ? OR m.id_destinatario = ?
     ORDER BY m.criado_em DESC
  `).all(req.user.id, req.user.id, req.user.id);
  // Agrupa por outro usuário
  const byUser = new Map();
  for (const r of rows) {
    const outroId = r.id_remetente === req.user.id ? r.id_destinatario : r.id_remetente;
    if (!byUser.has(outroId)) {
      byUser.set(outroId, {
        outro_id: outroId,
        outro_nome: r.outro_nome,
        ultima_mensagem: r.conteudo,
        ultima_em: r.criado_em,
        nao_lidas: 0
      });
    }
    if (r.id_destinatario === req.user.id && r.lida === 0) {
      byUser.get(outroId).nao_lidas += 1;
    }
  }
  res.json({ conversas: Array.from(byUser.values()) });
});

/**
 * GET /api/mensagens/:outroId  — histórico com um usuário específico
 */
router.get('/:outroId', authRequired, (req, res) => {
  const outroId = Number(req.params.outroId);
  const rows = db.prepare(`
    SELECT * FROM mensagens
     WHERE (id_remetente = ? AND id_destinatario = ?)
        OR (id_remetente = ? AND id_destinatario = ?)
     ORDER BY criado_em ASC
     LIMIT 500
  `).all(req.user.id, outroId, outroId, req.user.id);
  // Marca como lidas
  db.prepare(`
    UPDATE mensagens SET lida = 1
     WHERE id_remetente = ? AND id_destinatario = ? AND lida = 0
  `).run(outroId, req.user.id);
  res.json({ mensagens: rows });
});

/**
 * POST /api/mensagens  — enviar mensagem (também via socket; este endpoint
 * é o fallback HTTP para clientes sem socket).
 */
router.post('/', authRequired, validateBody({
  id_destinatario: { required: true, type: 'integer', min: 1 },
  conteudo:        { required: true, type: 'string', min: 1, max: 2000 },
  id_vaga:         { type: 'integer', min: 1 }
}), (req, res) => {
  const { id_destinatario, conteudo, id_vaga } = req.body;
  if (id_destinatario === req.user.id) {
    return res.status(400).json({ error: 'Não é possível enviar mensagem para si mesmo' });
  }
  const info = db.prepare(`
    INSERT INTO mensagens (id_remetente, id_destinatario, id_vaga, conteudo)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, id_destinatario, id_vaga || null, conteudo);
  const msg = db.prepare('SELECT * FROM mensagens WHERE id = ?').get(info.lastInsertRowid);
  // Tenta emitir via socket.io (se o módulo for inicializado)
  if (globalThis.__io) {
    globalThis.__io.to(`user:${id_destinatario}`).emit('mensagem:nova', msg);
    globalThis.__io.to(`user:${req.user.id}`).emit('mensagem:nova', msg);
  }
  res.status(201).json({ mensagem: msg });
});

export default router;
