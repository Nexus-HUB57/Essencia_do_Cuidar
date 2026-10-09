import express from 'express';
import db from '../db/index.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';

const router = express.Router();

const candidaturaSchema = {
  id_vaga:  { required: true, type: 'integer', min: 1 },
  mensagem: { type: 'string', max: 1000 }
};

/**
 * POST /api/candidaturas  — profissional se candidata a uma vaga
 */
router.post('/', authRequired, requireTipo('profissional'),
  validateBody(candidaturaSchema), async (req, res) => {
    const { id_vaga, mensagem } = req.body;
    const vaga = db.prepare('SELECT * FROM vagas WHERE id = ? AND status = \'ativa\'').get(id_vaga);
    if (!vaga) return res.status(404).json({ error: 'Vaga não disponível' });
    try {
      const info = db.prepare(`
        INSERT INTO candidaturas (id_vaga, id_profissional, mensagem)
        VALUES (?, ?, ?)
      `).run(id_vaga, req.user.id, mensagem || null);
      const cand = db.prepare('SELECT * FROM candidaturas WHERE id = ?').get(info.lastInsertRowid);
      notifyNetlify('candidatura_enviada', {
        candidatura_id: cand.id,
        vaga_id: id_vaga,
        profissional_id: req.user.id
      });
      res.status(201).json({ candidatura: cand });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
      }
      throw err;
    }
  }
);

/**
 * GET /api/candidaturas/minhas  — candidaturas do profissional logado
 */
router.get('/profissional/minhas', authRequired, requireTipo('profissional'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, v.profissional_desejado, v.complexidade, v.regiao, v.remuneracao_valor,
           v.remuneracao_tipo, v.status AS vaga_status, v.servico_descricao,
           v.id_contratante, u.nome AS contratante_nome
      FROM candidaturas c
      JOIN vagas v ON v.id = c.id_vaga
      JOIN users u ON u.id = v.id_contratante
     WHERE c.id_profissional = ?
     ORDER BY c.criado_em DESC
  `).all(req.user.id);
  res.json({ candidaturas: rows });
});

/**
 * GET /api/candidaturas/vaga/:id  — contratante lista candidatos de uma vaga
 */
router.get('/vaga/:id', authRequired, requireTipo('contratante'), (req, res) => {
  const id = Number(req.params.id);
  const vaga = db.prepare('SELECT * FROM vagas WHERE id = ?').get(id);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
  if (vaga.id_contratante !== req.user.id) {
    return res.status(403).json({ error: 'Você não é dono desta vaga' });
  }
  // Marca como visualizada
  db.prepare(`
    UPDATE candidaturas SET status_candidatura = 'visualizada'
     WHERE id_vaga = ? AND status_candidatura = 'pendente'
  `).run(id);

  const rows = db.prepare(`
    SELECT c.id, c.mensagem, c.status_candidatura, c.criado_em,
           u.id AS profissional_id, u.nome AS profissional_nome, u.email AS profissional_email,
           u.telefone AS profissional_telefone,
           d.registro_conselho, d.tipo_registro, d.diploma_verificado,
           d.registro_verificado, d.especialidades, d.disponibilidade, d.bio
      FROM candidaturas c
      JOIN users u ON u.id = c.id_profissional
      LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
     WHERE c.id_vaga = ?
     ORDER BY c.criado_em DESC
  `).all(id);
  // Parse JSON
  for (const r of rows) {
    try { r.especialidades = JSON.parse(r.especialidades || '[]'); } catch { r.especialidades = []; }
    try { r.disponibilidade = JSON.parse(r.disponibilidade || '[]'); } catch { r.disponibilidade = []; }
  }
  res.json({ candidatos: rows });
});

/**
 * PATCH /api/candidaturas/:id  — aceitar ou recusar
 */
router.patch('/:id', authRequired, requireTipo('contratante'),
  validateBody({
    status_candidatura: { required: true, type: 'enum', values: ['aceita', 'recusada'] }
  }),
  (req, res) => {
    const id = Number(req.params.id);
    const cand = db.prepare(`
      SELECT c.*, v.id_contratante FROM candidaturas c
      JOIN vagas v ON v.id = c.id_vaga
      WHERE c.id = ?
    `).get(id);
    if (!cand) return res.status(404).json({ error: 'Candidatura não encontrada' });
    if (cand.id_contratante !== req.user.id) {
      return res.status(403).json({ error: 'Você não é dono desta vaga' });
    }
    db.prepare(`UPDATE candidaturas SET status_candidatura = ? WHERE id = ?`)
      .run(req.body.status_candidatura, id);
    const updated = db.prepare('SELECT * FROM candidaturas WHERE id = ?').get(id);
    notifyNetlify(`candidatura_${req.body.status_candidatura}`, {
      candidatura_id: id, vaga_id: cand.id_vaga, profissional_id: cand.id_profissional
    });
    res.json({ candidatura: updated });
  }
);

export default router;
