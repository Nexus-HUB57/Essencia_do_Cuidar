import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { fireWebhook } from './webhook.js';
import { json } from '../middleware/body.js';

const router = Router();

// POST /api/candidaturas  -> profissional se candidata a uma vaga
router.post('/', authRequired, json, (req, res) => {
  if (req.user.tipo_usuario !== 'profissional') {
    return res.status(403).json({ error: 'apenas profissionais podem se candidatar' });
  }
  const { id_vaga, mensagem } = req.body || {};
  if (!id_vaga) return res.status(400).json({ error: 'id_vaga obrigatório' });

  const vaga = db.prepare("SELECT * FROM vagas WHERE id = ? AND status = 'ativa'").get(id_vaga);
  if (!vaga) return res.status(404).json({ error: 'vaga não disponível' });

  try {
    const info = db.prepare(`
      INSERT INTO candidaturas (id_vaga, id_profissional, mensagem)
      VALUES (?, ?, ?)
    `).run(id_vaga, req.user.id, mensagem || null);

    const cand = db.prepare('SELECT * FROM candidaturas WHERE id = ?').get(info.lastInsertRowid);
    fireWebhook('candidatura.created', { candidatura: cand, vaga }).catch(() => {});
    res.status(201).json(cand);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'você já se candidatou a esta vaga' });
    }
    throw e;
  }
});

// GET /api/candidaturas/minhas  -> profissional vê suas candidaturas
router.get('/minhas', authRequired, (req, res) => {
  if (req.user.tipo_usuario !== 'profissional') return res.status(403).json({ error: 'apenas profissional' });
  const rows = db.prepare(`
    SELECT c.*, v.servico_descricao, v.complexidade, v.regiao, v.remuneracao_valor, v.remuneracao_tipo
    FROM candidaturas c JOIN vagas v ON v.id = c.id_vaga
    WHERE c.id_profissional = ?
    ORDER BY c.criado_em DESC
  `).all(req.user.id);
  res.json(rows);
});

// GET /api/candidaturas?vaga=X  -> contratante vê candidatos de uma vaga
router.get('/', authRequired, (req, res) => {
  const { vaga } = req.query;
  if (!vaga) return res.status(400).json({ error: 'vaga (id) obrigatório' });
  const v = db.prepare('SELECT * FROM vagas WHERE id = ? AND id_contratante = ?').get(Number(vaga), req.user.id);
  if (!v) return res.status(404).json({ error: 'vaga não encontrada' });
  const rows = db.prepare(`
    SELECT c.id, c.status_candidatura, c.mensagem, c.criado_em,
           u.id AS profissional_id, u.nome, u.email, u.telefone,
           p.registro_conselho,
           p.diploma_url, p.diploma_original_name, p.diploma_uploaded_at,
           p.registro_conselho_url, p.registro_conselho_original_name, p.registro_conselho_uploaded_at,
           p.especialidades, p.disponibilidade
    FROM candidaturas c
    JOIN users u ON u.id = c.id_profissional
    LEFT JOIN profissionais_detalhes p ON p.id_user = u.id
    WHERE c.id_vaga = ?
    ORDER BY c.criado_em DESC
  `).all(Number(vaga));
  res.json(rows.map(r => ({
    ...r,
    especialidades: r.especialidades ? JSON.parse(r.especialidades) : [],
    disponibilidade: r.disponibilidade ? JSON.parse(r.disponibilidade) : {},
    documentos: {
      diploma: !!r.diploma_url,
      registro_conselho: !!r.registro_conselho_url,
    },
  })));
});

// PATCH /api/candidaturas/:id  -> contratante aceita/recusa
router.patch('/:id', authRequired, json, (req, res) => {
  const id = Number(req.params.id);
  const { status_candidatura } = req.body || {};
  if (!['visualizada', 'aceita', 'recusada'].includes(status_candidatura)) {
    return res.status(400).json({ error: 'status inválido' });
  }
  const cand = db.prepare(`
    SELECT c.*, v.id_contratante FROM candidaturas c
    JOIN vagas v ON v.id = c.id_vaga
    WHERE c.id = ?
  `).get(id);
  if (!cand) return res.status(404).json({ error: 'candidatura não encontrada' });
  if (cand.id_contratante !== req.user.id) return res.status(403).json({ error: 'sem permissão' });
  db.prepare('UPDATE candidaturas SET status_candidatura = ? WHERE id = ?').run(status_candidatura, id);
  res.json({ ok: true });
});

export default router;
