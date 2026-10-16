/**
 * Avaliações pós-atendimento.
 *
 * Fluxo:
 *  1. Candidatura é aceita pelo contratante.
 *  2. Vaga é fechada (status='fechada').
 *  3. Ambos os lados podem se avaliar (1-5 estrelas + comentário).
 *  4. Avaliações aparecem no perfil público do profissional e contam
 *     para a média exibida.
 *
 * Cada lado avalia de forma independente — uma row por
 * (candidatura, avaliador). O UNIQUE no schema garante que cada lado
 * só avalie uma vez.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

const avaliacaoSchema = {
  id_candidatura: { required: true, type: 'integer', min: 1 },
  nota:           { required: true, type: 'integer', min: 1, max: 5 },
  comentario:     { type: 'string', max: 1000 }
};

/**
 * POST /api/avaliacoes
 * Body: { id_candidatura, nota, comentario? }
 *
 * Regras:
 *  - User deve ser dono da candidatura (contratante) ou o profissional
 *    candidatado.
 *  - Candidatura precisa estar com status='aceita'.
 *  - Vaga precisa estar com status='fechada' (atendimento concluído).
 *  - Não pode avaliar a si mesmo.
 *  - Só pode avaliar uma vez por (candidatura, avaliador).
 */
router.post('/', authRequired, validateBody(avaliacaoSchema), (req, res) => {
  const { id_candidatura, nota, comentario } = req.body;
  const cand = db.prepare(`
    SELECT c.*, v.status AS vaga_status, v.id_contratante
      FROM candidaturas c
      JOIN vagas v ON v.id = c.id_vaga
     WHERE c.id = ?
  `).get(id_candidatura);

  if (!cand) return res.status(404).json({ error: 'Candidatura não encontrada' });

  // Definir avaliador e avaliado
  let id_avaliador, id_avaliado, avaliador_tipo;
  if (req.user.tipo_usuario === 'contratante' && req.user.id === cand.id_contratante) {
    id_avaliador = req.user.id;
    id_avaliado = cand.id_profissional;
    avaliador_tipo = 'contratante';
  } else if (req.user.tipo_usuario === 'profissional' && req.user.id === cand.id_profissional) {
    id_avaliador = req.user.id;
    id_avaliado = cand.id_contratante;
    avaliador_tipo = 'profissional';
  } else {
    return res.status(403).json({ error: 'Você não participa desta candidatura' });
  }

  if (cand.status_candidatura !== 'aceita') {
    return res.status(400).json({ error: 'Só é possível avaliar candidaturas aceitas' });
  }
  if (cand.vaga_status !== 'fechada') {
    return res.status(400).json({ error: 'A vaga precisa estar encerrada para ser avaliada' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO avaliacoes (id_candidatura, id_avaliador, id_avaliado, avaliador_tipo, nota, comentario)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id_candidatura, id_avaliador, id_avaliado, avaliador_tipo, nota, comentario || null);
    const row = db.prepare('SELECT * FROM avaliacoes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ avaliacao: row });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Você já avaliou esta candidatura' });
    }
    throw err;
  }
});

/**
 * GET /api/avaliacoes/pendentes
 * Lista avaliações que o usuário logado AINDA pode fazer
 * (candidaturas aceitas em vagas fechadas, sem avaliação do user).
 */
router.get('/pendentes', authRequired, (req, res) => {
  let rows;
  if (req.user.tipo_usuario === 'contratante') {
    rows = db.prepare(`
      SELECT c.id AS candidatura_id, c.criado_em AS candidatura_criado_em,
             v.id AS vaga_id, v.profissional_desejado, v.servico_descricao,
             v.regiao, v.criado_em AS vaga_criado_em,
             u.id AS outro_id, u.nome AS outro_nome,
             d.registro_conselho, d.tipo_registro
        FROM candidaturas c
        JOIN vagas v ON v.id = c.id_vaga
        JOIN users u ON u.id = c.id_profissional
        LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
       WHERE v.id_contratante = ?
         AND c.status_candidatura = 'aceita'
         AND v.status = 'fechada'
         AND NOT EXISTS (
           SELECT 1 FROM avaliacoes a
            WHERE a.id_candidatura = c.id AND a.id_avaliador = ?
         )
       ORDER BY c.criado_em DESC
    `).all(req.user.id, req.user.id);
  } else {
    rows = db.prepare(`
      SELECT c.id AS candidatura_id, c.criado_em AS candidatura_criado_em,
             v.id AS vaga_id, v.profissional_desejado, v.servico_descricao,
             v.regiao, v.criado_em AS vaga_criado_em,
             u.id AS outro_id, u.nome AS outro_nome
        FROM candidaturas c
        JOIN vagas v ON v.id = c.id_vaga
        JOIN users u ON u.id = v.id_contratante
       WHERE c.id_profissional = ?
         AND c.status_candidatura = 'aceita'
         AND v.status = 'fechada'
         AND NOT EXISTS (
           SELECT 1 FROM avaliacoes a
            WHERE a.id_candidatura = c.id AND a.id_avaliador = ?
         )
       ORDER BY c.criado_em DESC
    `).all(req.user.id, req.user.id);
  }
  res.json({ pendentes: rows });
});

/**
 * GET /api/avaliacoes/profissional/:id
 * Lista pública das avaliações recebidas por um profissional.
 * Inclui stats (média e total) no header customizado.
 */
router.get('/profissional/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare(
    `SELECT id, nome FROM users WHERE id = ? AND tipo_usuario = 'profissional'`
  ).get(id);
  if (!user) return res.status(404).json({ error: 'Profissional não encontrado' });

  const rows = db.prepare(`
    SELECT a.id, a.nota, a.comentario, a.criado_em,
           a.avaliador_tipo,
           u.nome AS avaliador_nome
      FROM avaliacoes a
      JOIN users u ON u.id = a.id_avaliador
     WHERE a.id_avaliado = ?
       AND a.avaliador_tipo = 'contratante'
     ORDER BY a.criado_em DESC
     LIMIT 50
  `).all(id);

  const stats = db.prepare(`
    SELECT COUNT(*) AS total,
           ROUND(AVG(nota), 1) AS media
      FROM avaliacoes
     WHERE id_avaliado = ?
       AND avaliador_tipo = 'contratante'
  `).get(id);

  res.json({
    profissional: user,
    avaliacoes: rows,
    stats: { total: stats?.total || 0, media: stats?.media || 0 }
  });
});

/**
 * GET /api/avaliacoes/candidatura/:id
 * Avaliações existentes para uma candidatura (mostra se cada lado já avaliou).
 */
router.get('/candidatura/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const cand = db.prepare(`
    SELECT c.*, v.id_contratante
      FROM candidaturas c
      JOIN vagas v ON v.id = c.id_vaga
     WHERE c.id = ?
  `).get(id);
  if (!cand) return res.status(404).json({ error: 'Candidatura não encontrada' });

  // Só os dois envolvidos podem ver
  if (req.user.id !== cand.id_profissional && req.user.id !== cand.id_contratante) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const rows = db.prepare(`
    SELECT * FROM avaliacoes WHERE id_candidatura = ?
  `).all(id);
  res.json({ avaliacoes: rows });
});

export default router;
