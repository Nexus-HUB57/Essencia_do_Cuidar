import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function ensureAccess(req, vagaId) {
  const v = db.prepare('SELECT * FROM vagas WHERE id = ?').get(vagaId);
  if (!v) return { error: 'vaga não encontrada', status: 404 };
  if (req.user.tipo_usuario === 'contratante' && v.id_contratante !== req.user.id) {
    return { error: 'sem permissão', status: 403 };
  }
  if (req.user.tipo_usuario === 'profissional') {
    const cand = db.prepare('SELECT id FROM candidaturas WHERE id_vaga = ? AND id_profissional = ?').get(vagaId, req.user.id);
    if (!cand) return { error: 'apenas candidatos podem acessar este chat', status: 403 };
  }
  return { vaga: v };
}

// GET /api/chat?vaga=X  -> lista mensagens
router.get('/', authRequired, (req, res) => {
  const id_vaga = Number(req.query.vaga);
  if (!id_vaga) return res.status(400).json({ error: 'vaga obrigatória' });
  const access = ensureAccess(req, id_vaga);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const rows = db.prepare(`
    SELECT m.*, u.nome AS remetente_nome, u.tipo_usuario AS remetente_tipo
    FROM mensagens m JOIN users u ON u.id = m.id_remetente
    WHERE m.id_vaga = ? ORDER BY m.criado_em ASC
  `).all(id_vaga);
  res.json(rows);
});

// POST /api/chat  -> envia mensagem
router.post('/', authRequired, (req, res) => {
  const { id_vaga, corpo } = req.body || {};
  if (!id_vaga || !corpo) return res.status(400).json({ error: 'id_vaga e corpo obrigatórios' });
  const access = ensureAccess(req, Number(id_vaga));
  if (access.error) return res.status(access.status).json({ error: access.error });
  const info = db.prepare(`
    INSERT INTO mensagens (id_vaga, id_remetente, corpo) VALUES (?, ?, ?)
  `).run(Number(id_vaga), req.user.id, String(corpo).slice(0, 2000));
  const msg = db.prepare(`
    SELECT m.*, u.nome AS remetente_nome, u.tipo_usuario AS remetente_tipo
    FROM mensagens m JOIN users u ON u.id = m.id_remetente
    WHERE m.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(msg);
});

export default router;
