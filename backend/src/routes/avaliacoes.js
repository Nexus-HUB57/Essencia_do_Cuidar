/**
 * Avaliações: contratante → profissional (1-5 ⭐ + comentário).
 *
 * A rota espera:
 *  - que a vaga seja do contratante logado
 *  - que exista candidatura aceita do profissional na vaga
 *  - apenas 1 avaliação por (contratante, vaga) — UNIQUE no schema
 *
 * Migrado para o driver unificado (sqlite/postgres) — usa `await db.get()`
 * e `await db.all()` ao invés de `db.prepare(...).get/all`.
 */
import express from 'express';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';

const router = express.Router();

/**
 * POST /api/avaliacoes
 * Body: { id_profissional, id_vaga, nota, comentario? }
 */
router.post('/', authRequired, requireTipo('contratante'),
  validateBody({
    id_profissional: { required: true, type: 'integer', min: 1 },
    id_vaga:         { required: true, type: 'integer', min: 1 },
    nota:            { required: true, type: 'integer', min: 1, max: 5 },
    comentario:      { type: 'string', max: 1000 }
  }),
  async (req, res) => {
    const { id_profissional, id_vaga, nota, comentario } = req.body;

    const vaga = await db.get(
      'SELECT * FROM vagas WHERE id = ? AND id_contratante = ?',
      [id_vaga, req.user.id]
    );
    if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada ou não é sua' });

    const cand = await db.get(`
      SELECT id FROM candidaturas
       WHERE id_vaga = ? AND id_profissional = ? AND status_candidatura = 'aceita'
    `, [id_vaga, id_profissional]);
    if (!cand) return res.status(403).json({ error: 'Só é possível avaliar profissionais que você aceitou' });

    try {
      const info = await db.run(`
        INSERT INTO avaliacoes (id_contratante, id_profissional, id_vaga, nota, comentario)
        VALUES (?, ?, ?, ?, ?)
      `, [req.user.id, id_profissional, id_vaga, nota, comentario || null]);
      const av = await db.get('SELECT * FROM avaliacoes WHERE id = ?', [info.lastInsertRowid]);
      notifyNetlify('avaliacao_criada', {
        avaliacao_id: av.id, vaga_id: id_vaga, profissional_id: id_profissional, nota
      });
      res.status(201).json({ avaliacao: av });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        // Atualiza em vez de duplicar
        await db.run(`
          UPDATE avaliacoes SET nota = ?, comentario = ?
           WHERE id_contratante = ? AND id_vaga = ?
        `, [nota, comentario || null, req.user.id, id_vaga]);
        const av = await db.get(
          'SELECT * FROM avaliacoes WHERE id_contratante = ? AND id_vaga = ?',
          [req.user.id, id_vaga]
        );
        return res.json({ avaliacao: av, updated: true });
      }
      throw err;
    }
  }
);

/**
 * GET /api/avaliacoes/profissional/:id
 * Pública: stats (média, total, distribuição) + últimas 50 avaliações.
 */
router.get('/profissional/:id', async (req, res) => {
  const id = Number(req.params.id);
  const stats = await db.get(`
    SELECT
      COUNT(*) AS total,
      COALESCE(ROUND(AVG(nota), 2), 0) AS media,
      SUM(CASE WHEN nota = 5 THEN 1 ELSE 0 END) AS cinco,
      SUM(CASE WHEN nota = 4 THEN 1 ELSE 0 END) AS quatro,
      SUM(CASE WHEN nota = 3 THEN 1 ELSE 0 END) AS tres,
      SUM(CASE WHEN nota = 2 THEN 1 ELSE 0 END) AS dois,
      SUM(CASE WHEN nota = 1 THEN 1 ELSE 0 END) AS um
    FROM avaliacoes WHERE id_profissional = ?
  `, [id]);

  const rows = await db.all(`
    SELECT a.nota, a.comentario, a.criado_em, u.nome AS contratante_nome
      FROM avaliacoes a
      JOIN users u ON u.id = a.id_contratante
     WHERE a.id_profissional = ?
     ORDER BY a.criado_em DESC
     LIMIT 50
  `, [id]);
  res.json({ stats, avaliacoes: rows });
});

/**
 * GET /api/avaliacoes/minhas
 * Contratante logado vê as avaliações que já fez.
 */
router.get('/minhas', authRequired, requireTipo('contratante'), async (req, res) => {
  const rows = await db.all(`
    SELECT a.*, u.nome AS profissional_nome, v.profissional_desejado
      FROM avaliacoes a
      JOIN users u ON u.id = a.id_profissional
      JOIN vagas v ON v.id = a.id_vaga
     WHERE a.id_contratante = ?
     ORDER BY a.criado_em DESC
  `, [req.user.id]);
  res.json({ avaliacoes: rows });
});

export default router;
