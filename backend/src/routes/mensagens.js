import express from 'express';
import db from '../db/driver.js';
import { authRequired } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyUser } from '../services/push.js';

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const rows = await db.all(
    `SELECT m.*, u.nome AS outro_nome
       FROM mensagens m
       JOIN users u ON u.id = CASE
         WHEN m.id_remetente = ? THEN m.id_destinatario
         ELSE m.id_remetente
       END
      WHERE m.id_remetente = ? OR m.id_destinatario = ?
      ORDER BY m.criado_em DESC`,
    [req.user.id, req.user.id, req.user.id]
  );
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

router.get('/:outroId', authRequired, async (req, res) => {
  const outroId = Number(req.params.outroId);
  const rows = await db.all(
    `SELECT * FROM mensagens
      WHERE (id_remetente = ? AND id_destinatario = ?)
         OR (id_remetente = ? AND id_destinatario = ?)
      ORDER BY criado_em ASC
      LIMIT 500`,
    [req.user.id, outroId, outroId, req.user.id]
  );
  await db.run(
    `UPDATE mensagens SET lida = 1
      WHERE id_remetente = ? AND id_destinatario = ? AND lida = 0`,
    [outroId, req.user.id]
  );
  res.json({ mensagens: rows });
});

router.post('/', authRequired, validateBody({
  id_destinatario: { required: true, type: 'integer', min: 1 },
  conteudo:        { required: true, type: 'string', min: 1, max: 2000 },
  id_vaga:         { type: 'integer', min: 1 }
}), async (req, res) => {
  const { id_destinatario, conteudo, id_vaga } = req.body;
  if (id_destinatario === req.user.id) {
    return res.status(400).json({ error: 'Não é possível enviar mensagem para si mesmo' });
  }
  const info = await db.run(
    `INSERT INTO mensagens (id_remetente, id_destinatario, id_vaga, conteudo)
     VALUES (?, ?, ?, ?)`,
    [req.user.id, id_destinatario, id_vaga || null, conteudo]
  );
  const msg = await db.get('SELECT * FROM mensagens WHERE id = ?', [info.lastInsertRowid]);
  if (globalThis.__io) {
    // W1 — Emite só para o DESTINATÁRIO (não mais para o remetente).
    // O remetente já vê a mensagem pela resposta HTTP 201 (UI otimista não precisa de echo).
    // Antes: emitia para user:destinatario E user:remetente → causava duplicação no chat.
    globalThis.__io.to(`user:${id_destinatario}`).emit('mensagem:nova', msg);
  }
  // Web push (best-effort)
  notifyUser(id_destinatario, {
    title: `Nova mensagem`,
    body: conteudo.slice(0, 100),
    data: { url: `/dashboard/${req.user.tipo_usuario === 'contratante' ? 'profissional' : 'contratante'}` }
  }).catch(() => {});
  res.status(201).json({ mensagem: msg });
});

export default router;
