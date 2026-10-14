import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { json } from '../middleware/body.js';
import { fireWebhook } from './webhook.js';

const router = Router();

/**
 * GET /api/avaliacoes/pendentes
 * Lista as candidaturas ACEITAS (em vagas FECHADAS) do contratante logado
 * que ainda não foram avaliadas. É o "inbox" de avaliações pendentes.
 *
 * Lógica: o contratante só pode avaliar DEPOIS do serviço.
 *   - candidatura.status_candidatura = 'aceita'
 *   - vaga.status = 'fechada'
 *   - ainda não existe avaliacao para (id_vaga, id_profissional)
 */
router.get('/pendentes', authRequired, requireRole('contratante'), (req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id AS candidatura_id,
      c.id_vaga, c.id_profissional, c.criado_em AS candidatura_criada_em,
      v.servico_descricao, v.regiao, v.criado_em AS vaga_criada_em,
      u.nome AS profissional_nome, u.email AS profissional_email
    FROM candidaturas c
    JOIN vagas v ON v.id = c.id_vaga
    JOIN users u ON u.id = c.id_profissional
    WHERE v.id_contratante = ?
      AND c.status_candidatura = 'aceita'
      AND v.status = 'fechada'
      AND NOT EXISTS (
        SELECT 1 FROM avaliacoes a
        WHERE a.id_vaga = c.id_vaga AND a.id_profissional = c.id_profissional
      )
    ORDER BY v.criado_em DESC
  `).all(req.user.id);
  res.json(rows);
});

/**
 * GET /api/avaliacoes?vaga=X
 * Lista as avaliações já feitas para uma vaga do contratante logado.
 * Útil para a tela de candidatos mostrar quem já foi avaliado.
 */
router.get('/', authRequired, (req, res) => {
  const { vaga } = req.query;
  if (!vaga) return res.status(400).json({ error: 'vaga (id) obrigatório' });
  const v = db.prepare('SELECT * FROM vagas WHERE id = ? AND id_contratante = ?').get(Number(vaga), req.user.id);
  if (!v) return res.status(404).json({ error: 'vaga não encontrada' });
  const rows = db.prepare(`
    SELECT a.id, a.id_profissional, a.nota, a.comentario, a.criado_em,
           u.nome AS profissional_nome
    FROM avaliacoes a
    JOIN users u ON u.id = a.id_profissional
    WHERE a.id_vaga = ?
    ORDER BY a.criado_em DESC
  `).all(Number(vaga));
  res.json(rows);
});

/**
 * GET /api/avaliacoes/profissional/:id
 * Lista pública (apenas autenticado) de avaliações + resumo (média, total).
 * É o que alimenta o perfil público do profissional e a vitrine do app.
 */
router.get('/profissional/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const prof = db.prepare("SELECT id, nome FROM users WHERE id = ? AND tipo_usuario = 'profissional'").get(id);
  if (!prof) return res.status(404).json({ error: 'profissional não encontrado' });

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      AVG(nota) AS media,
      SUM(CASE WHEN nota = 5 THEN 1 ELSE 0 END) AS cinco,
      SUM(CASE WHEN nota = 4 THEN 1 ELSE 0 END) AS quatro,
      SUM(CASE WHEN nota = 3 THEN 1 ELSE 0 END) AS tres,
      SUM(CASE WHEN nota = 2 THEN 1 ELSE 0 END) AS dois,
      SUM(CASE WHEN nota = 1 THEN 1 ELSE 0 END) AS um
    FROM avaliacoes WHERE id_profissional = ?
  `).get(id);

  const reviews = db.prepare(`
    SELECT a.id, a.nota, a.comentario, a.criado_em, a.id_vaga,
           u.nome AS contratante_nome,
           v.servico_descricao, v.regiao
    FROM avaliacoes a
    JOIN users u ON u.id = a.id_contratante
    JOIN vagas v ON v.id = a.id_vaga
    WHERE a.id_profissional = ?
    ORDER BY a.criado_em DESC
    LIMIT 50
  `).all(id);

  res.json({
    profissional_id: id,
    total: stats.total || 0,
    media: stats.media ? Number(Number(stats.media).toFixed(2)) : 0,
    distribuicao: {
      5: stats.cinco || 0, 4: stats.quatro || 0, 3: stats.tres || 0,
      2: stats.dois || 0, 1: stats.um || 0,
    },
    reviews,
  });
});

/**
 * POST /api/avaliacoes
 * Body: { id_vaga, id_profissional, nota, comentario }
 * Regras:
 *   - apenas contratante dono da vaga
 *   - candidatura precisa estar 'aceita'
 *   - vaga precisa estar 'fechada'
 *   - uma avaliação por (vaga, profissional) — UNIQUE no DB
 */
router.post('/', authRequired, requireRole('contratante'), json, async (req, res) => {
  const { id_vaga, id_profissional, nota, comentario } = req.body || {};
  if (!id_vaga || !id_profissional) {
    return res.status(400).json({ error: 'id_vaga e id_profissional são obrigatórios' });
  }
  const n = Number(nota);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return res.status(400).json({ error: 'nota deve ser um inteiro entre 1 e 5' });
  }
  if (comentario != null && typeof comentario === 'string' && comentario.length > 1000) {
    return res.status(400).json({ error: 'comentário deve ter no máximo 1000 caracteres' });
  }

  const vaga = db.prepare('SELECT * FROM vagas WHERE id = ? AND id_contratante = ?').get(Number(id_vaga), req.user.id);
  if (!vaga) return res.status(404).json({ error: 'vaga não encontrada' });
  if (vaga.status !== 'fechada') {
    return res.status(400).json({ error: 'a vaga precisa estar encerrada (fechada) para ser avaliada' });
  }

  const cand = db.prepare(`
    SELECT * FROM candidaturas
    WHERE id_vaga = ? AND id_profissional = ? AND status_candidatura = 'aceita'
  `).get(Number(id_vaga), Number(id_profissional));
  if (!cand) return res.status(400).json({ error: 'apenas candidaturas aceitas podem ser avaliadas' });

  try {
    const info = db.prepare(`
      INSERT INTO avaliacoes (id_vaga, id_contratante, id_profissional, nota, comentario)
      VALUES (?, ?, ?, ?, ?)
    `).run(Number(id_vaga), req.user.id, Number(id_profissional), n, comentario || null);

    const avaliacao = db.prepare('SELECT * FROM avaliacoes WHERE id = ?').get(info.lastInsertRowid);
    fireWebhook('avaliacao.created', { avaliacao, vaga }).catch(() => {});
    res.status(201).json(avaliacao);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'este profissional já foi avaliado nesta vaga' });
    }
    throw e;
  }
});

export default router;
