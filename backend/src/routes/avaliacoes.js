/**
 * Sistema de avaliações — contratante avalia profissional após aceitá-lo.
 *
 *   POST /api/avaliacoes                  → cria (ou atualiza) avaliação
 *   GET  /api/avaliacoes/profissional/:id → média + distribuição + comentários
 *   GET  /api/avaliacoes/minhas           → avaliações feitas pelo contratante
 *
 * Migrado para o driver unificado (SQLite/PostgreSQL) — API async.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';

const router = express.Router();

/**
 * POST /api/avaliacoes
 * Contratante avalia um profissional (1-5 estrelas + comentário opcional).
 * Requer id_vaga válida que o contratante possua e profissional aceito nela.
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

    // Verifica que a vaga é do contratante
    const vaga = await db.get(
      'SELECT * FROM vagas WHERE id = ? AND id_contratante = ?',
      [id_vaga, req.user.id]
    );
    if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada ou não é sua' });

    // Verifica que o profissional foi aceito nessa vaga
    const cand = await db.get(
      `SELECT id FROM candidaturas
        WHERE id_vaga = ? AND id_profissional = ? AND status_candidatura = 'aceita'`,
      [id_vaga, id_profissional]
    );
    if (!cand) return res.status(403).json({ error: 'Só é possível avaliar profissionais que você aceitou' });

    try {
      const info = await db.run(
        `INSERT INTO avaliacoes (id_contratante, id_profissional, id_vaga, nota, comentario)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, id_profissional, id_vaga, nota, comentario || null]
      );
      const av = await db.get('SELECT * FROM avaliacoes WHERE id = ?', [info.lastInsertRowid]);
      notifyNetlify('avaliacao_criada', {
        avaliacao_id: av.id, vaga_id: id_vaga, profissional_id: id_profissional, nota
      });
      res.status(201).json({ avaliacao: av });
    } catch (err) {
      const dup = String(err.message).includes('UNIQUE') || String(err.code) === 'SQLITE_CONSTRAINT_UNIQUE' || String(err.code) === '23505';
      if (dup) {
        // 1 avaliação por (contratante, vaga) — atualiza em vez de duplicar
        await db.run(
          `UPDATE avaliacoes SET nota = ?, comentario = ?, criado_em = datetime('now')
            WHERE id_contratante = ? AND id_vaga = ?`,
          [nota, comentario || null, req.user.id, id_vaga]
        );
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
 * Pública: média, distribuição e últimos comentários.
 */
router.get('/profissional/:id', async (req, res) => {
  const id = Number(req.params.id);
  const stats = await db.get(
    `SELECT
        COUNT(*) AS total,
        COALESCE(ROUND(AVG(nota), 2), 0) AS media,
        SUM(CASE WHEN nota = 5 THEN 1 ELSE 0 END) AS cinco,
        SUM(CASE WHEN nota = 4 THEN 1 ELSE 0 END) AS quatro,
        SUM(CASE WHEN nota = 3 THEN 1 ELSE 0 END) AS tres,
        SUM(CASE WHEN nota = 2 THEN 1 ELSE 0 END) AS dois,
        SUM(CASE WHEN nota = 1 THEN 1 ELSE 0 END) AS um
      FROM avaliacoes WHERE id_profissional = ?`,
    [id]
  );

  const rows = await db.all(
    `SELECT a.nota, a.comentario, a.criado_em, u.nome AS contratante_nome
       FROM avaliacoes a
       JOIN users u ON u.id = a.id_contratante
      WHERE a.id_profissional = ?
      ORDER BY a.criado_em DESC
      LIMIT 50`,
    [id]
  );
  res.json({ stats, avaliacoes: rows });
});

/**
 * GET /api/avaliacoes/minhas
 * Contratante vê as avaliações que já fez.
 */
router.get('/minhas', authRequired, requireTipo('contratante'), async (req, res) => {
  const rows = await db.all(
    `SELECT a.*, u.nome AS profissional_nome, v.profissional_desejado
       FROM avaliacoes a
       JOIN users u ON u.id = a.id_profissional
       JOIN vagas v ON v.id = a.id_vaga
      WHERE a.id_contratante = ?
      ORDER BY a.criado_em DESC`,
    [req.user.id]
  );
  res.json({ avaliacoes: rows });
});

export default router;