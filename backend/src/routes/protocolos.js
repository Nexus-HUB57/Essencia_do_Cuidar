/**
 * routes/protocolos.js
 *
 * Sistema de Protocolos de Pagamento (escrow / custódia).
 *
 * Fluxo:
 *   1. PCP — criado quando contratante aceita candidatura (via PATCH /candidaturas/:id)
 *      → PATCH /api/candidaturas/:id (status='aceita') dispara criarPCP()
 *
 *   2. PCM — enviado ao profissional (já vem do PCP). Ele:
 *      POST /api/protocolos/:id/aceitar (profissional aceita → gera PDC)
 *      POST /api/protocolos/:id/recusar (profissional recusa → reabre vaga)
 *
 *   3. PDC — contratante paga custódia:
 *      POST /api/protocolos/:id/pagar (simula pagamento em modo mock)
 *      → PDC status 'em_custodia' → 'checkout_pendente'
 *
 *   4. Checkout bidirecional:
 *      POST /api/protocolos/:id/checkout (profissional OU contratante confirma)
 *      → Ambos confirmam → status 'checkout_completo'
 *
 *   5. Liberação (em até 72h):
 *      POST /api/protocolos/:id/liberar (admin ou sistema)
 *      → status 'liberado' → profissional recebe
 *
 * Endpoints:
 *   GET    /api/protocolos                          → lista protocolos do user logado
 *   GET    /api/protocolos/:id                      → detalhe de um protocolo
 *   POST   /api/protocolos/:id/aceitar              → profissional aceita PCM
 *   POST   /api/protocolos/:id/recusar              → profissional recusa PCM
 *   POST   /api/protocolos/:id/pagar                → contratante paga PDC
 *   POST   /api/protocolos/:id/checkout             → profissional/contratante confirma execução
 *   POST   /api/protocolos/:id/liberar              → admin/sistema libera pagamento
 *   POST   /api/protocolos/:id/cancelar             → contratante/admin cancela (reembolso)
 *   GET    /api/protocolos/:id/checkouts           → lista checkouts do protocolo
 *   GET    /api/protocolos/:id/historico-status     → histórico de transições (auditoria)
 */
import express from 'express';
import db from '../db/driver.js';
import { authRequired, requireTipo, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  aceitarPCM, recusarPCM, pagarPDC, fazerCheckout, liberarPagamento,
  cancelarProtocolo, listarMeusProtocolos, listarCheckouts, listarHistoricoStatus
} from '../services/protocolos.js';
import { recusarPagamentoPNP, adminResolverPNP } from '../services/protocolos-ppp-pnp.js';

const router = express.Router();

/**
 * GET /api/protocolos
 * Lista protocolos do user logado (como contratante OU profissional).
 * Query: tipo (PCP|PCM|PDC|CHECKOUT), status, limite, offset
 */
router.get('/', authRequired, async (req, res) => {
  const protocolos = await listarMeusProtocolos(req.user.id, {
    tipo: req.query.tipo,
    status: req.query.status,
    limite: req.query.limite,
    offset: req.query.offset
  });
  res.json({ protocolos, total: protocolos.length });
});

/**
 * GET /api/protocolos/:id
 * Detalhe de um protocolo. Apenas contratante, profissional ou admin.
 */
router.get('/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const p = await db.get(
    `SELECT p.*,
            v.profissional_desejado AS vaga_titulo,
            v.servico_descricao AS vaga_descricao,
            v.regiao AS vaga_regiao,
            v.regiao_uf AS vaga_uf,
            v.jornada_horario AS vaga_horario,
            v.jornada_escala AS vaga_escala,
            v.complexidade AS vaga_complexidade,
            v.remuneracao_tipo AS vaga_remuneracao_tipo,
            c.nome AS contratante_nome,
            pr.nome AS profissional_nome
       FROM protocolos p
       JOIN vagas v ON v.id = p.id_vaga
       JOIN users c ON c.id = p.id_contratante
       JOIN users pr ON pr.id = p.id_profissional
      WHERE p.id = ?`,
    [id]
  );
  if (!p) return res.status(404).json({ error: 'Protocolo não encontrado' });
  if (p.id_contratante !== req.user.id && p.id_profissional !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  // Inclui pagamento em custódia
  const pagamento = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [id]);
  res.json({ protocolo: p, pagamento });
});

/**
 * POST /api/protocolos/:id/aceitar
 * Profissional aceita PCM → gera PDC automaticamente.
 */
router.post('/:id/aceitar', authRequired, requireTipo('profissional'), async (req, res) => {
  try {
    const pdc = await aceitarPCM(Number(req.params.id), req.user.id);
    res.json({ pdc, mensagem: 'PCM aceito. PDC gerado e enviado ao contratante.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/protocolos/:id/recusar
 * Profissional recusa PCM → reabre vaga.
 * Body: { motivo: string (opcional) }
 */
router.post('/:id/recusar', authRequired, requireTipo('profissional'),
  validateBody({ motivo: { type: 'string', max: 500 } }),
  async (req, res) => {
    try {
      const result = await recusarPCM(Number(req.params.id), req.user.id, req.body.motivo);
      res.json({ ...result, mensagem: 'PCM recusado. Vaga reaberta.' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * POST /api/protocolos/:id/pagar
 * Contratante paga PDC (custódia).
 *
 * Fluxo:
 *   1. MERCADOPAGO_MOCK=true (default): simula pagamento imediato e confirma custódia.
 *   2. MERCADOPAGO_MOCK=false (live): cria cobrança Pix e retorna QR code.
 *      Após webhook MP confirmar, sistema chama pagarPDC() automaticamente.
 *      Contratante pode também chamar POST /:id/confirmar-pix após receber
 *      notificação externa de que pagou via Pix (fallback ao webhook).
 */
router.post('/:id/pagar', authRequired, requireTipo('contratante'), async (req, res) => {
  try {
    const pdc_id = Number(req.params.id);
    const { criarCobrancaPix, isMock: mpIsMock } = await import('../services/mercadopago.js');

    // Mock MP: confirma imediato (legacy behavior)
    if (mpIsMock) {
      const result = await pagarPDC(pdc_id, req.user.id);
      return res.json({
        ...result,
        mensagem: 'Pagamento em custódia confirmado. Profissional notificado com garantia.',
        pix_flow: false
      });
    }

    // Live MP: cria cobrança Pix, retorna QR code, NÃO confirma ainda
    const pdc = await db.get('SELECT * FROM protocolos WHERE id = ? AND tipo = ?', [pdc_id, 'PDC']);
    if (!pdc) return res.status(404).json({ error: 'PDC não encontrado' });
    if (pdc.id_contratante !== req.user.id) return res.status(403).json({ error: 'Não autorizado' });
    if (pdc.status !== 'enviado') return res.status(400).json({ error: `PDC não pode ser pago (status: ${pdc.status})` });

    const user = await db.get('SELECT email FROM users WHERE id = ?', [req.user.id]);
    const cobranca = await criarCobrancaPix({
      protocolo_id: pdc_id,
      valor_centavos: pdc.valor_total_centavos,
      descricao: `Custódia de Plantão #${pdc_id} — Essência do Cuidar`,
      contratante_id: req.user.id,
      metadata: {
        contratante_email: user?.email,
        vaga_id: pdc.id_vaga,
        profissional_id: pdc.id_profissional
      }
    });

    // Salva payment_id do MP na tabela pagamentos_custodia (stripe_payment_intent_id)
    await db.run(
      `UPDATE pagamentos_custodia SET stripe_payment_intent_id = ? WHERE id_protocolo = ?`,
      [cobranca.payment_id, pdc_id]
    );

    return res.json({
      pix_flow: true,
      payment_id: cobranca.payment_id,
      txid: cobranca.txid,
      qr_code_base64: cobranca.qr_code_base64,
      qr_code_texto: cobranca.qr_code_texto,
      valor_total_centavos: pdc.valor_total_centavos,
      mensagem: 'Pix gerado. Após confirmação do pagamento, o sistema confirmará a custódia automaticamente.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/protocolos/:id/confirmar-pix
 * Confirma manualmente um pagamento Pix (fallback ao webhook MP).
 * Em modo mock: simula confirmação imediata.
 * Em modo live: consulta status no MP, e se 'approved', chama pagarPDC.
 */
router.post('/:id/confirmar-pix', authRequired, requireTipo('contratante'), async (req, res) => {
  try {
    const pdc_id = Number(req.params.id);
    const { consultarPagamento, isMock: mpIsMock } = await import('../services/mercadopago.js');
    const { pagarPDC } = await import('../services/protocolos.js');

    if (mpIsMock) {
      const result = await pagarPDC(pdc_id, req.user.id);
      return res.json({ ...result, mensagem: 'Pix confirmado (mock). Custódia ativa.', pix_flow: false });
    }

    // Live: consulta MP
    const pag = await db.get('SELECT stripe_payment_intent_id FROM pagamentos_custodia WHERE id_protocolo = ?', [pdc_id]);
    if (!pag?.stripe_payment_intent_id) {
      return res.status(400).json({ error: 'Nenhuma cobrança Pix encontrada para este protocolo' });
    }
    const info = await consultarPagamento(pag.stripe_payment_intent_id);
    if (info.status !== 'approved') {
      return res.status(202).json({ status: info.status, mensagem: 'Pagamento ainda não aprovado pelo MP' });
    }
    // Aprovado — chama pagarPDC
    const result = await pagarPDC(pdc_id, null);  // null = sistema
    res.json({ ...result, mensagem: 'Pix confirmado. Custódia ativa.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/protocolos/:id/checkout
 * Profissional OU contratante confirma execução do plantão.
 * Body: { nota: 1-5 (opcional), comentario: string (opcional) }
 */
router.post('/:id/checkout', authRequired, validateBody({
  nota: { type: 'integer', min: 1, max: 5 },
  comentario: { type: 'string', max: 1000 }
}), async (req, res) => {
  try {
    const tipoUser = req.user.tipo_usuario === 'profissional' ? 'profissional' : 'contratante';
    const result = await fazerCheckout(Number(req.params.id), {
      user_id: req.user.id,
      tipo_user: tipoUser,
      nota: req.body.nota,
      comentario: req.body.comentario
    });
    res.json({
      ...result,
      mensagem: result.checkout_completo
        ? 'Checkout completo! Pagamento será liberado em até 72h.'
        : 'Checkout registrado. Aguardando a outra parte.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/protocolos/:id/liberar
 * Libera pagamento ao profissional.
 * Admin pode liberar imediatamente. Sistema libera via cron após 72h.
 */
router.post('/:id/liberar', authRequired, async (req, res) => {
  try {
    // Admin pode liberar a qualquer momento; outros não podem (apenas cron)
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Apenas admin pode liberar pagamento manualmente' });
    }
    const result = await liberarPagamento(Number(req.params.id));
    res.json({ ...result, mensagem: 'Pagamento liberado ao profissional.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/protocolos/:id/cancelar
 * Contratante (se em_custodia) ou admin cancela protocolo (reembolso).
 * Body: { motivo: string }
 */
router.post('/:id/cancelar', authRequired, validateBody({
  motivo: { type: 'string', max: 500 }
}), async (req, res) => {
  try {
    const result = await cancelarProtocolo(Number(req.params.id), req.user.id, req.body.motivo);
    res.json({ ...result, mensagem: 'Protocolo cancelado. Reembolso processado.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/protocolos/:id/checkouts
 * Lista checkouts (profissional + contratante) do protocolo.
 */
router.get('/:id/checkouts', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  // Verifica autorização
  const p = await db.get('SELECT id_contratante, id_profissional FROM protocolos WHERE id = ?', [id]);
  if (!p) return res.status(404).json({ error: 'Protocolo não encontrado' });
  if (p.id_contratante !== req.user.id && p.id_profissional !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const checkouts = await listarCheckouts(id);
  res.json({ checkouts });
});

/**
 * GET /api/protocolos/:id/historico-status
 * Histórico de transições de status (auditoria).
 */
router.get('/:id/historico-status', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  // Verifica autorização
  const p = await db.get('SELECT id_contratante, id_profissional FROM protocolos WHERE id = ?', [id]);
  if (!p) return res.status(404).json({ error: 'Protocolo não encontrado' });
  if (p.id_contratante !== req.user.id && p.id_profissional !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const historico = await listarHistoricoStatus(id);
  res.json({ historico });
});

// ───────────────────────────────────────────────────────────────────
// PNP — Protocolo de Não Pagamento (5 critérios de recusa)
// ───────────────────────────────────────────────────────────────────

/**
 * POST /api/protocolos/:id/recusar-pagamento
 * Contratante recusa o pagamento com um dos 5 critérios do PNP.
 *
 * Body: {
 *   criterio: 'nao_compareceu'|'abandono_plantao'|'irregularidade'|'imprevisto'|'recusa_titular',
 *   descricao: string,
 *   horas_trabalhadas: number (apenas para 'imprevisto')
 * }
 */
router.post('/:id/recusar-pagamento', authRequired, requireTipo('contratante'),
  validateBody({
    criterio: { required: true, type: 'enum', values: ['nao_compareceu', 'abandono_plantao', 'irregularidade', 'imprevisto', 'recusa_titular'] },
    descricao: { type: 'string', max: 1000 },
    horas_trabalhadas: { type: 'number', min: 0 }
  }),
  async (req, res) => {
    try {
      const result = await recusarPagamentoPNP(
        Number(req.params.id),
        req.user.id,
        req.body
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * POST /api/protocolos/:id/resolver-pnp
 * Admin resolve um PNP em análise.
 *
 * Body: {
 *   decisao: 'reembolso_total'|'reembolso_parcial'|'liberar_profissional',
 *   valor_parcial_centavos: number (apenas para 'reembolso_parcial'),
 *   motivo: string
 * }
 */
router.post('/:id/resolver-pnp', authRequired, requireAdmin,
  validateBody({
    decisao: { required: true, type: 'enum', values: ['reembolso_total', 'reembolso_parcial', 'liberar_profissional'] },
    valor_parcial_centavos: { type: 'integer', min: 0 },
    motivo: { type: 'string', max: 500 }
  }),
  async (req, res) => {
    try {
      const result = await adminResolverPNP(
        Number(req.params.id),
        req.user.id,
        req.body
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * GET /api/protocolos/ppp/pendentes
 * Lista protocolos com PPP em andamento (checkout_profissional = contratante não respondeu).
 * Admin pode ver para monitorar.
 */
router.get('/ppp/pendentes', authRequired, requireAdmin, async (req, res) => {
  const rows = await db.all(
    `SELECT p.*, v.profissional_desejado AS vaga_titulo,
            c.nome AS contratante_nome, pr.nome AS profissional_nome
       FROM protocolos p
       JOIN vagas v ON v.id = p.id_vaga
       JOIN users c ON c.id = p.id_contratante
       JOIN users pr ON pr.id = p.id_profissional
      WHERE p.status = 'checkout_profissional'
      ORDER BY p.checkout_profissional_em ASC`
  );
  const agora = new Date();
  const comHoras = rows.map(r => {
    const checkout = new Date(r.checkout_profissional_em + 'Z');
    const horas = ((agora - checkout) / (1000 * 60 * 60)).toFixed(1);
    return { ...r, horas_desde_checkout: Number(horas), proxima_notificacao: horas < 24 ? '2ª (24h)' : horas < 48 ? '3ª (48h)' : 'auto-confirmação' };
  });
  res.json({ ppp_pendentes: comHoras, total: comHoras.length });
});

/**
 * GET /api/protocolos/pnp/em-analise
 * Lista PNPs em análise administrativa.
 */
router.get('/pnp/em-analise', authRequired, requireAdmin, async (req, res) => {
  const rows = await db.all(
    `SELECT p.*, v.profissional_desejado AS vaga_titulo,
            c.nome AS contratante_nome, pr.nome AS profissional_nome
       FROM protocolos p
       JOIN vagas v ON v.id = p.id_vaga
       JOIN users c ON c.id = p.id_contratante
       JOIN users pr ON pr.id = p.id_profissional
      WHERE p.status = 'em_analise_pnp'
      ORDER BY p.criado_em DESC`
  );
  res.json({ pnp_em_analise: rows, total: rows.length });
});

export default router;
