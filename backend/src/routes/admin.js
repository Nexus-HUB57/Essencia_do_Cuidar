/**
 * Feature 5 — Painel administrativo.
 *
 * Endpoints (todos exigem is_admin=1):
 *   GET  /api/admin/stats                          → métricas gerais
 *   GET  /api/admin/users                          → lista usuários (com filtro tipo)
 *   PATCH /api/admin/users/:id                     → suspender / ativar
 *   POST /api/admin/users/:id/admin                → promover a admin
 *   GET  /api/admin/vagas                          → todas as vagas (com filtro status)
 *   PATCH /api/admin/vagas/:id                     → fechar / reativar (moderação)
 *   DELETE /api/admin/vagas/:id                    → remover
 *   GET  /api/admin/reports                        → denúncias
 *   PATCH /api/admin/reports/:id                   → analisar / resolver
 *   GET  /api/admin/verificacoes                   → verificações de registro pendentes
 *   PATCH /api/admin/verificacoes/:id              → aprovar / rejeitar verificação
 *   GET  /api/admin/webhooks                       → últimos webhooks
 *   POST /api/admin/webhooks/retry                 → N1: dispara retry manual dos webhooks com falha
 *   GET  /api/admin/pagamentos                     → todos os pagamentos
 */
import express from 'express';
import db from '../db/driver.js';
import { authRequired, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { retryFailedWebhooks } from '../services/webhook-retry.js';
import { expirarCandidaturasAntigas } from '../services/candidatura-cleanup.js';

const router = express.Router();

router.use(authRequired, requireAdmin);

router.get('/stats', async (req, res) => {
  const [users, profissionais, contratantes, vagasAtivas, candidaturas, mensagens, pagamentosPagos, reportsAbertos, verPendentes] = await Promise.all([
    db.get('SELECT COUNT(*) AS n FROM users'),
    db.get("SELECT COUNT(*) AS n FROM users WHERE tipo_usuario = 'profissional'"),
    db.get("SELECT COUNT(*) AS n FROM users WHERE tipo_usuario = 'contratante'"),
    db.get("SELECT COUNT(*) AS n FROM vagas WHERE status = 'ativa'"),
    db.get('SELECT COUNT(*) AS n FROM candidaturas'),
    db.get('SELECT COUNT(*) AS n FROM mensagens'),
    db.get("SELECT COUNT(*) AS n, COALESCE(SUM(valor_centavos), 0) AS total FROM pagamentos WHERE status IN ('pago', 'split_realizado')"),
    db.get("SELECT COUNT(*) AS n FROM reports WHERE status = 'aberto'"),
    db.get("SELECT COUNT(*) AS n FROM verificacao_registros WHERE status = 'pendente'")
  ]);
  res.json({
    users: users.n, profissionais: profissionais.n, contratantes: contratantes.n,
    vagas_ativas: vagasAtivas.n, candidaturas: candidaturas.n, mensagens: mensagens.n,
    receita_total_centavos: Number(pagamentosPagos.total || 0),
    pagamentos_realizados: pagamentosPagos.n,
    reports_abertos: reportsAbertos.n,
    verificacoes_pendentes: verPendentes.n
  });
});

router.get('/users', async (req, res) => {
  const { tipo, q, limit = 50, offset = 0 } = req.query;
  const filters = [];
  const params = [];
  if (tipo) { filters.push('tipo_usuario = ?'); params.push(tipo); }
  if (q) { filters.push('(nome LIKE ? OR email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const rows = await db.all(
    `SELECT id, tipo_usuario, nome, email, telefone, is_admin, suspended_at, criado_em
       FROM users ${where} ORDER BY criado_em DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  res.json({ users: rows });
});

router.patch('/users/:id', validateBody({
  suspended: { type: 'boolean' },
  motivo:    { type: 'string', max: 200 }
}), async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.get('SELECT id, is_admin FROM users WHERE id = ?', [id]);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (u.is_admin && req.body.suspended) {
    return res.status(400).json({ error: 'Não é possível suspender outro admin' });
  }
  if (req.body.suspended) {
    await db.run(
      `UPDATE users SET suspended_at = datetime('now'), suspended_reason = ? WHERE id = ?`,
      [req.body.motivo || 'Violação dos termos', id]
    );
  } else {
    await db.run(
      `UPDATE users SET suspended_at = NULL, suspended_reason = NULL WHERE id = ?`,
      [id]
    );
  }
  await db.run(
    `INSERT INTO admin_audit (id_admin, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, req.body.suspended ? 'user.suspend' : 'user.unsuspend', 'user', id, req.body.motivo || null]
  );
  res.json({ ok: true });
});

router.post('/users/:id/admin', validateBody({ is_admin: { required: true, type: 'boolean' } }),
  async (req, res) => {
    const id = Number(req.params.id);
    await db.run('UPDATE users SET is_admin = ? WHERE id = ?', [req.body.is_admin ? 1 : 0, id]);
    await db.run(
      `INSERT INTO admin_audit (id_admin, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, req.body.is_admin ? 'user.promote_admin' : 'user.demote_admin', 'user', id, null]
    );
    res.json({ ok: true });
  }
);

router.get('/vagas', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  const filters = [];
  const params = [];
  if (status) { filters.push('v.status = ?'); params.push(status); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const rows = await db.all(
    `SELECT v.*, u.nome AS contratante_nome, u.email AS contratante_email
       FROM vagas v JOIN users u ON u.id = v.id_contratante
       ${where} ORDER BY v.criado_em DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  res.json({ vagas: rows });
});

router.patch('/vagas/:id', validateBody({
  status: { type: 'enum', values: ['ativa', 'pausada', 'fechada'] }
}), async (req, res) => {
  const id = Number(req.params.id);
  const vaga = await db.get('SELECT id FROM vagas WHERE id = ?', [id]);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
  await db.run('UPDATE vagas SET status = ? WHERE id = ?', [req.body.status, id]);
  await db.run(
    `INSERT INTO admin_audit (id_admin, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, 'vaga.moderate', 'vaga', id, JSON.stringify(req.body)]
  );
  res.json({ ok: true });
});

router.delete('/vagas/:id', async (req, res) => {
  const id = Number(req.params.id);
  await db.run('DELETE FROM vagas WHERE id = ?', [id]);
  await db.run(
    `INSERT INTO admin_audit (id_admin, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, 'vaga.delete', 'vaga', id, null]
  );
  res.json({ ok: true });
});

router.get('/reports', async (req, res) => {
  const { status } = req.query;
  const filters = [];
  const params = [];
  if (status) { filters.push('r.status = ?'); params.push(status); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const rows = await db.all(
    `SELECT r.*, u.nome AS reportou_nome, u.email AS reportou_email
       FROM reports r JOIN users u ON u.id = r.id_user_reportou
       ${where} ORDER BY r.criado_em DESC LIMIT 100`,
    params
  );
  res.json({ reports: rows });
});

router.patch('/reports/:id', validateBody({
  status: { required: true, type: 'enum', values: ['analisando', 'resolvido', 'descartado'] }
}), async (req, res) => {
  const id = Number(req.params.id);
  const upd = req.body.status === 'resolvido' ? `, resolvido_em = datetime('now'), resolvido_por = ?` : '';
  await db.run(`UPDATE reports SET status = ? ${upd} WHERE id = ?`,
    req.body.status === 'resolvido'
      ? [req.body.status, req.user.id, id]
      : [req.body.status, id]
  );
  res.json({ ok: true });
});

router.get('/verificacoes', async (req, res) => {
  const { status = 'pendente' } = req.query;
  const rows = await db.all(
    `SELECT v.*, u.nome AS profissional_nome, u.email AS profissional_email, d.diploma_url
       FROM verificacao_registros v
       JOIN users u ON u.id = v.id_user
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE v.status = ?
      ORDER BY v.criado_em ASC LIMIT 100`,
    [status]
  );
  res.json({ verificacoes: rows });
});

router.patch('/verificacoes/:id', validateBody({
  status: { required: true, type: 'enum', values: ['aprovado', 'rejeitado'] },
  motivo: { type: 'string', max: 500 }
}), async (req, res) => {
  const id = Number(req.params.id);
  const v = await db.get('SELECT * FROM verificacao_registros WHERE id = ?', [id]);
  if (!v) return res.status(404).json({ error: 'Verificação não encontrada' });
  await db.run(
    `UPDATE verificacao_registros
        SET status = ?, motivo = COALESCE(?, motivo), verificado_por = ?, verificado_em = datetime('now')
      WHERE id = ?`,
    [req.body.status, req.body.motivo || null, req.user.id, id]
  );
  if (req.body.status === 'aprovado') {
    await db.run(
      'UPDATE profissionais_detalhes SET registro_verificado = 1 WHERE id_user = ?',
      [v.id_user]
    );
  }
  await db.run(
    `INSERT INTO admin_audit (id_admin, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, `verificacao.${req.body.status}`, 'verificacao', id, req.body.motivo || null]
  );
  res.json({ ok: true });
});

router.get('/webhooks', async (req, res) => {
  const rows = await db.all(
    'SELECT * FROM webhook_logs ORDER BY criado_em DESC LIMIT 100'
  );
  res.json({ webhooks: rows });
});

/**
 * POST /api/admin/webhooks/retry
 * N1 — Dispara manualmente o retry de webhooks com falha.
 * Busca webhook_logs com erro != null ou status >= 500 nas últimas 24h e reenvia.
 *
 * Em produção, recomenda-se chamar via cron job a cada 30min:
 *   curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     $BACKEND_URL/api/admin/webhooks/retry
 *
 * Query params (opcionais):
 *   maxAgeHours  — janela de busca em horas (default 24)
 */
router.post('/webhooks/retry', async (req, res) => {
  try {
    const result = await retryFailedWebhooks();
    res.json({
      ok: true,
      tentados: result.tentados,
      sucesso: result.sucesso,
      falha: result.falha
    });
  } catch (err) {
    console.error('[admin/webhook-retry]', err);
    res.status(500).json({ error: 'Falha ao executar retry', detalhe: err.message });
  }
});

/**
 * M9 — POST /api/admin/candidaturas/limpar-expiradas
 * Dispara a expiração automática de candidaturas pendentes há mais de
 * CANDIDATURA_EXPIRA_DIAS (default 30). Recomendado cron diário.
 */
router.post('/candidaturas/limpar-expiradas', async (req, res) => {
  try {
    const result = await expirarCandidaturasAntigas();
    res.json({
      ok: true,
      expiradas: result.expiradas,
      notificadas: result.notificadas,
      erro: result.erro
    });
  } catch (err) {
    console.error('[admin/limpar-expiradas]', err);
    res.status(500).json({ error: 'Falha ao expirar candidaturas', detalhe: err.message });
  }
});

router.get('/pagamentos', async (req, res) => {
  const rows = await db.all(
    `SELECT p.*, v.profissional_desejado, c.nome AS contratante_nome, pr.nome AS profissional_nome
       FROM pagamentos p
       JOIN vagas v ON v.id = p.id_vaga
       JOIN users c ON c.id = p.id_contratante
       JOIN users pr ON pr.id = p.id_profissional
       ORDER BY p.criado_em DESC LIMIT 100`
  );
  res.json({ pagamentos: rows });
});

export default router;
