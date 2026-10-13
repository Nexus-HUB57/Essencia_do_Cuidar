import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { fireWebhook } from './webhook.js';
import { json } from '../middleware/body.js';

const router = Router();

// GET /api/vagas  -> lista vagas ativas (com filtros)
router.get('/', authRequired, (req, res) => {
  const { complexidade, regiao, tipo_profissional, q } = req.query;
  const where = ["v.status = 'ativa'"];
  const params = [];
  if (complexidade) { where.push('v.complexidade = ?'); params.push(complexidade); }
  if (regiao) { where.push('LOWER(v.regiao) LIKE ?'); params.push(`%${String(regiao).toLowerCase()}%`); }
  if (tipo_profissional) { where.push('LOWER(v.profissional_desejado) LIKE ?'); params.push(`%${String(tipo_profissional).toLowerCase()}%`); }
  if (q) { where.push('(LOWER(v.servico_descricao) LIKE ? OR LOWER(v.paciente_diagnostico) LIKE ?)'); params.push(`%${String(q).toLowerCase()}%`, `%${String(q).toLowerCase()}%`); }

  const rows = db.prepare(`
    SELECT v.*, u.nome AS contratante_nome
    FROM vagas v
    JOIN users u ON u.id = v.id_contratante
    WHERE ${where.join(' AND ')}
    ORDER BY v.criado_em DESC
  `).all(...params);
  res.json(rows);
});

// GET /api/vagas/:id
router.get('/:id', authRequired, (req, res) => {
  const v = db.prepare(`
    SELECT v.*, u.nome AS contratante_nome, u.email AS contratante_email, u.telefone AS contratante_telefone
    FROM vagas v JOIN users u ON u.id = v.id_contratante
    WHERE v.id = ?
  `).get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'vaga não encontrada' });
  res.json(v);
});

// POST /api/vagas  -> contratante cria
router.post('/', authRequired, requireRole('contratante'), json, (req, res) => {
  const b = req.body || {};
  if (!b.servico_descricao) return res.status(400).json({ error: 'servico_descricao obrigatório' });
  if (!b.complexidade || !['baixa', 'media'].includes(b.complexidade)) {
    return res.status(400).json({ error: 'complexidade deve ser "baixa" ou "media" (sistema não aceita alta complexidade/UTI)' });
  }

  const info = db.prepare(`
    INSERT INTO vagas
      (id_contratante, paciente_sexo, paciente_idade, paciente_diagnostico,
       complexidade, servico_descricao, profissional_desejado,
       jornada_horario, jornada_escala, tipo_contrato, remuneracao_tipo, remuneracao_valor, regiao)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.id,
    b.paciente_sexo || null,
    b.paciente_idade || null,
    b.paciente_diagnostico || null,
    b.complexidade,
    b.servico_descricao,
    b.profissional_desejado || null,
    b.jornada_horario || null,
    b.jornada_escala || null,
    b.tipo_contrato || null,
    b.remuneracao_tipo || null,
    b.remuneracao_valor || null,
    b.regiao || null
  );

  const vaga = db.prepare('SELECT * FROM vagas WHERE id = ?').get(info.lastInsertRowid);
  // Webhook simulado de notificação
  fireWebhook('vaga.created', { vaga }).catch(() => {});

  res.status(201).json(vaga);
});

// GET /api/vagas/minhas  -> contratante lista as suas
router.get('/minhas/list', authRequired, requireRole('contratante'), (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM vagas WHERE id_contratante = ? ORDER BY criado_em DESC
  `).all(req.user.id);
  res.json(rows);
});

// PATCH /api/vagas/:id/status  -> pausar/fechar
router.patch('/:id/status', authRequired, requireRole('contratante'), json, (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare('SELECT * FROM vagas WHERE id = ? AND id_contratante = ?').get(id, req.user.id);
  if (!v) return res.status(404).json({ error: 'vaga não encontrada' });
  const { status } = req.body || {};
  if (!['ativa', 'pausada', 'fechada'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  db.prepare('UPDATE vagas SET status = ? WHERE id = ?').run(status, id);
  res.json({ ok: true });
});

export default router;
