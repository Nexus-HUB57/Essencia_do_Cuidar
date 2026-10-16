import express from 'express';
import db from '../db/index.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';

const router = express.Router();

// Todas as rotas abaixo exigem usuário do tipo 'admin'.
router.use(authRequired, requireTipo('admin'));

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

function logModeracao(idVaga, idAdmin, acao, motivo) {
  db.prepare(`
    INSERT INTO vagas_moderacao (id_vaga, id_admin, acao, motivo)
    VALUES (?, ?, ?, ?)
  `).run(idVaga, idAdmin, acao, motivo || null);
}

function applyModeracao(idVaga, idAdmin, acao, motivo) {
  // acao: 'flag' | 'unflag' | 'remove' | 'restore'
  const updates = {
    flag:    'flagged',
    unflag:  'ok',
    remove:  'removida',
    restore: 'ok'
  };
  const novoStatus = updates[acao];
  if (!novoStatus) throw new Error(`acao inválida: ${acao}`);

  db.prepare(`
    UPDATE vagas
       SET moderacao_status = ?,
           moderacao_motivo = ?,
           moderado_por = ?,
           moderado_em = CURRENT_TIMESTAMP
     WHERE id = ?
  `).run(novoStatus, motivo || null, idAdmin, idVaga);

  // Log: usa o 'acao' cru (flag/unflag/remove/restore) — bate com o CHECK
  // do schema. O `column` (novoStatus) é o que vai pra coluna moderacao_status.
  logModeracao(idVaga, idAdmin, acao, motivo);
  notifyNetlify('admin.moderacao', { id_vaga: idVaga, acao, novo_status: novoStatus, motivo }).catch(() => {});
}

const flagSchema = {
  motivo: { type: 'string', min: 3, max: 500 }
};

/* ------------------------------------------------------------------ *
 *  GET /api/admin/stats  — KPIs do sistema
 * ------------------------------------------------------------------ */
router.get('/stats', (req, res) => {
  const get = (sql, ...params) => db.prepare(sql).get(...params);

  const totais = {
    usuarios: get("SELECT COUNT(*) AS n FROM users").n,
    profissionais: get("SELECT COUNT(*) AS n FROM users WHERE tipo_usuario = 'profissional'").n,
    contratantes: get("SELECT COUNT(*) AS n FROM users WHERE tipo_usuario = 'contratante'").n,
    admins: get("SELECT COUNT(*) AS n FROM users WHERE tipo_usuario = 'admin'").n,
    vagas: {
      total: get('SELECT COUNT(*) AS n FROM vagas').n,
      ativas: get("SELECT COUNT(*) AS n FROM vagas WHERE status = 'ativa'").n,
      pausadas: get("SELECT COUNT(*) AS n FROM vagas WHERE status = 'pausada'").n,
      fechadas: get("SELECT COUNT(*) AS n FROM vagas WHERE status = 'fechada'").n
    },
    moderacao: {
      ok: get("SELECT COUNT(*) AS n FROM vagas WHERE moderacao_status = 'ok'").n,
      flagged: get("SELECT COUNT(*) AS n FROM vagas WHERE moderacao_status = 'flagged'").n,
      removidas: get("SELECT COUNT(*) AS n FROM vagas WHERE moderacao_status = 'removida'").n
    },
    profissionais_verificados: get("SELECT COUNT(*) AS n FROM profissionais_detalhes WHERE registro_verificado = 1").n,
    profissionais_pendentes: get("SELECT COUNT(*) AS n FROM profissionais_detalhes WHERE registro_verificado IN (0,2)").n,
    candidaturas: get('SELECT COUNT(*) AS n FROM candidaturas').n,
    avaliacoes: get('SELECT COUNT(*) AS n FROM avaliacoes').n,
    mensagens: get('SELECT COUNT(*) AS n FROM mensagens').n
  };

  // Vagas por dia nos últimos 14 dias (mini gráfico)
  const vagasPorDia = db.prepare(`
    SELECT DATE(criado_em) AS dia, COUNT(*) AS n
      FROM vagas
     WHERE criado_em >= datetime('now', '-14 days')
     GROUP BY DATE(criado_em)
     ORDER BY dia ASC
  `).all();

  // Profissionais por tipo de registro (COREN/CRM/etc.)
  const porTipoRegistro = db.prepare(`
    SELECT COALESCE(tipo_registro, 'não informado') AS tipo,
           COUNT(*) AS n
      FROM profissionais_detalhes
     GROUP BY tipo_registro
     ORDER BY n DESC
  `).all();

  res.json({ totais, vagasPorDia, porTipoRegistro });
});

/* ------------------------------------------------------------------ *
 *  GET /api/admin/vagas  — listagem com filtros
 *  ?status=ativa|pausada|fechada  &moderacao=ok|flagged|removida
 *  &q=texto  &contratante=N  &lim=50
 * ------------------------------------------------------------------ */
router.get('/vagas', (req, res) => {
  const { status, moderacao, q, contratante, lim } = req.query;
  const where = ['1=1'];
  const params = [];
  if (status)   { where.push('v.status = ?');          params.push(status); }
  if (moderacao){ where.push('v.moderacao_status = ?'); params.push(moderacao); }
  if (contratante) { where.push('v.id_contratante = ?'); params.push(Number(contratante)); }
  if (q) {
    where.push('(v.servico_descricao LIKE ? OR v.profissional_desejado LIKE ? OR v.regiao LIKE ? OR u.nome LIKE ?)');
    const t = `%${q}%`;
    params.push(t, t, t, t);
  }
  const limit = Math.min(Number(lim) || 100, 500);
  const rows = db.prepare(`
    SELECT v.*,
           u.nome AS contratante_nome,
           u.email AS contratante_email,
           (SELECT COUNT(*) FROM candidaturas WHERE id_vaga = v.id) AS total_candidatos,
           ma.nome AS moderado_por_nome
      FROM vagas v
      JOIN users u ON u.id = v.id_contratante
      LEFT JOIN users ma ON ma.id = v.moderado_por
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE v.moderacao_status WHEN 'removida' THEN 0 WHEN 'flagged' THEN 1 ELSE 2 END,
       v.criado_em DESC
     LIMIT ${limit}
  `).all(...params);
  res.json({ vagas: rows, total: rows.length });
});

/* ------------------------------------------------------------------ *
 *  GET /api/admin/vagas/:id  — detalhe completo
 * ------------------------------------------------------------------ */
router.get('/vagas/:id', (req, res) => {
  const id = Number(req.params.id);
  const vaga = db.prepare(`
    SELECT v.*,
           u.nome AS contratante_nome, u.email AS contratante_email, u.telefone AS contratante_telefone
      FROM vagas v
      JOIN users u ON u.id = v.id_contratante
     WHERE v.id = ?
  `).get(id);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });

  const cands = db.prepare(`
    SELECT c.*, p.nome AS profissional_nome
      FROM candidaturas c
      JOIN users p ON p.id = c.id_profissional
     WHERE c.id_vaga = ?
     ORDER BY c.criado_em DESC
  `).all(id);

  const historico = db.prepare(`
    SELECT m.*, u.nome AS admin_nome
      FROM vagas_moderacao m
      JOIN users u ON u.id = m.id_admin
     WHERE m.id_vaga = ?
     ORDER BY m.criado_em DESC
     LIMIT 50
  `).all(id);

  // Log de "view" — append-only, sem mutar vaga
  logModeracao(id, req.user.id, 'view', null);

  res.json({ vaga, candidaturas: cands, historico });
});

/* ------------------------------------------------------------------ *
 *  POST /api/admin/vagas/:id/flag
 *  body: { motivo }
 * ------------------------------------------------------------------ */
router.post('/vagas/:id/flag', validateBody(flagSchema), (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare('SELECT id FROM vagas WHERE id = ?').get(id);
  if (!v) return res.status(404).json({ error: 'Vaga não encontrada' });
  applyModeracao(id, req.user.id, 'flag', req.body.motivo);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 *  POST /api/admin/vagas/:id/unflag
 *  body: { motivo? }
 * ------------------------------------------------------------------ */
router.post('/vagas/:id/unflag', validateBody(flagSchema), (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare('SELECT id FROM vagas WHERE id = ?').get(id);
  if (!v) return res.status(404).json({ error: 'Vaga não encontrada' });
  applyModeracao(id, req.user.id, 'unflag', req.body.motivo);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 *  POST /api/admin/vagas/:id/remove   (soft delete)
 *  body: { motivo }
 *  Vaga some da listagem pública mas o histórico fica preservado.
 * ------------------------------------------------------------------ */
router.post('/vagas/:id/remove', validateBody(flagSchema), (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare('SELECT id FROM vagas WHERE id = ?').get(id);
  if (!v) return res.status(404).json({ error: 'Vaga não encontrada' });
  applyModeracao(id, req.user.id, 'remove', req.body.motivo);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 *  POST /api/admin/vagas/:id/restore
 *  body: { motivo? }
 * ------------------------------------------------------------------ */
router.post('/vagas/:id/restore', validateBody(flagSchema), (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare('SELECT id FROM vagas WHERE id = ?').get(id);
  if (!v) return res.status(404).json({ error: 'Vaga não encontrada' });
  applyModeracao(id, req.user.id, 'restore', req.body.motivo);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 *  GET /api/admin/usuarios  — lista com filtros
 *  ?tipo=profissional|contratante|admin  &q=  &lim=100
 * ------------------------------------------------------------------ */
router.get('/usuarios', (req, res) => {
  const { tipo, q, lim } = req.query;
  const where = ['1=1'];
  const params = [];
  if (tipo) { where.push('u.tipo_usuario = ?'); params.push(tipo); }
  if (q) {
    where.push('(u.nome LIKE ? OR u.email LIKE ?)');
    const t = `%${q}%`;
    params.push(t, t);
  }
  const limit = Math.min(Number(lim) || 100, 500);
  const rows = db.prepare(`
    SELECT u.id, u.tipo_usuario, u.nome, u.email, u.telefone, u.criado_em,
           pd.registro_conselho, pd.tipo_registro, pd.registro_verificado,
           (SELECT COUNT(*) FROM vagas WHERE id_contratante = u.id) AS total_vagas,
           (SELECT COUNT(*) FROM candidaturas WHERE id_profissional = u.id) AS total_candidaturas
      FROM users u
      LEFT JOIN profissionais_detalhes pd ON pd.id_user = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY u.criado_em DESC
     LIMIT ${limit}
  `).all(...params);
  res.json({ usuarios: rows, total: rows.length });
});

/* ------------------------------------------------------------------ *
 *  GET /api/admin/moderacao  — log global de ações
 *  ?lim=50
 * ------------------------------------------------------------------ */
router.get('/moderacao', (req, res) => {
  const lim = Math.min(Number(req.query.lim) || 50, 200);
  const rows = db.prepare(`
    SELECT m.*, u.nome AS admin_nome, v.servico_descricao
      FROM vagas_moderacao m
      JOIN users u ON u.id = m.id_admin
      JOIN vagas v ON v.id = m.id_vaga
     ORDER BY m.criado_em DESC
     LIMIT ${lim}
  `).all();
  res.json({ acoes: rows });
});

export default router;
