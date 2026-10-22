import express from 'express';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';

const router = express.Router();

const candidaturaSchema = {
  id_vaga:  { required: true, type: 'integer', min: 1 },
  mensagem: { type: 'string', max: 1000 }
};

router.post('/', authRequired, requireTipo('profissional'),
  validateBody(candidaturaSchema), async (req, res) => {
    const { id_vaga, mensagem } = req.body;
    const vaga = await db.get("SELECT * FROM vagas WHERE id = ? AND status = 'ativa'", [id_vaga]);
    if (!vaga) return res.status(404).json({ error: 'Vaga não disponível' });
    try {
      const info = await db.run(
        `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem)
         VALUES (?, ?, ?)`,
        [id_vaga, req.user.id, mensagem || null]
      );
      const cand = await db.get('SELECT * FROM candidaturas WHERE id = ?', [info.lastInsertRowid]);
      notifyNetlify('candidatura_enviada', {
        candidatura_id: cand.id, vaga_id: id_vaga, profissional_id: req.user.id
      });
      res.status(201).json({ candidatura: cand });
    } catch (err) {
      if (String(err.message).includes('UNIQUE') || String(err.code).includes('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
      }
      if (String(err.code) === '23505') {
        return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
      }
      throw err;
    }
  }
);

router.get('/profissional/minhas', authRequired, requireTipo('profissional'), async (req, res) => {
  const rows = await db.all(
    `SELECT c.*, v.profissional_desejado, v.complexidade, v.regiao, v.remuneracao_valor,
            v.remuneracao_tipo, v.status AS vaga_status, v.servico_descricao,
            v.id_contratante, u.nome AS contratante_nome
       FROM candidaturas c
       JOIN vagas v ON v.id = c.id_vaga
       JOIN users u ON u.id = v.id_contratante
      WHERE c.id_profissional = ?
      ORDER BY c.criado_em DESC`,
    [req.user.id]
  );
  res.json({ candidaturas: rows });
});

router.get('/vaga/:id', authRequired, requireTipo('contratante'), async (req, res) => {
  const id = Number(req.params.id);
  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [id]);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
  if (vaga.id_contratante !== req.user.id) {
    return res.status(403).json({ error: 'Você não é dono desta vaga' });
  }
  await db.run(
    `UPDATE candidaturas SET status_candidatura = 'visualizada'
      WHERE id_vaga = ? AND status_candidatura = 'pendente'`,
    [id]
  );
  const rows = await db.all(
    `SELECT c.id, c.mensagem, c.status_candidatura, c.criado_em,
            u.id AS profissional_id, u.nome AS profissional_nome, u.email AS profissional_email,
            u.telefone AS profissional_telefone,
            d.registro_conselho, d.tipo_registro, d.diploma_verificado,
            d.registro_verificado, d.especialidades, d.disponibilidade, d.bio
       FROM candidaturas c
       JOIN users u ON u.id = c.id_profissional
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE c.id_vaga = ?
      ORDER BY c.criado_em DESC`,
    [id]
  );
  for (const r of rows) {
    try { r.especialidades = JSON.parse(r.especialidades || '[]'); } catch { r.especialidades = []; }
    try { r.disponibilidade = JSON.parse(r.disponibilidade || '[]'); } catch { r.disponibilidade = []; }
  }
  res.json({ candidatos: rows });
});

router.patch('/:id', authRequired, requireTipo('contratante'),
  validateBody({
    status_candidatura: { required: true, type: 'enum', values: ['aceita', 'recusada'] }
  }),
  async (req, res) => {
    const id = Number(req.params.id);
    const cand = await db.get(
      `SELECT c.*, v.id_contratante FROM candidaturas c
       JOIN vagas v ON v.id = c.id_vaga
       WHERE c.id = ?`,
      [id]
    );
    if (!cand) return res.status(404).json({ error: 'Candidatura não encontrada' });
    if (cand.id_contratante !== req.user.id) {
      return res.status(403).json({ error: 'Você não é dono desta vaga' });
    }
    await db.run('UPDATE candidaturas SET status_candidatura = ? WHERE id = ?', [req.body.status_candidatura, id]);
    const updated = await db.get('SELECT * FROM candidaturas WHERE id = ?', [id]);
    notifyNetlify(`candidatura_${req.body.status_candidatura}`, {
      candidatura_id: id, vaga_id: cand.id_vaga, profissional_id: cand.id_profissional
    });
    res.json({ candidatura: updated });
  }
);

/**
 * GET /api/candidaturas/contratante/historico
 * Lista todas as vagas FECHADAS do contratante + profissional vencedor.
 */
router.get('/contratante/historico', authRequired, requireTipo('contratante'), async (req, res) => {
  const rows = await db.all(
    `SELECT v.id AS vaga_id, v.profissional_desejado, v.complexidade, v.regiao,
            v.remuneracao_valor, v.remuneracao_tipo, v.criado_em, v.status,
            u.id AS profissional_id, u.nome AS profissional_nome, u.telefone AS profissional_telefone,
            c.id AS candidatura_id, c.criado_em AS candidatura_em
       FROM vagas v
       JOIN candidaturas c ON c.id_vaga = v.id AND c.status_candidatura = 'aceita'
       JOIN users u ON u.id = c.id_profissional
      WHERE v.id_contratante = ? AND v.status = 'fechada'
      ORDER BY v.criado_em DESC`,
    [req.user.id]
  );

  // Adiciona info de avaliação (se houver)
  for (const r of rows) {
    const av = await db.get(
      `SELECT nota, comentario, criado_em FROM avaliacoes
        WHERE id_contratante = ? AND id_profissional = ? AND id_vaga = ?`,
      [req.user.id, r.profissional_id, r.vaga_id]
    );
    r.avaliacao = av || null;
  }
  res.json({ historico: rows });
});

export default router;
