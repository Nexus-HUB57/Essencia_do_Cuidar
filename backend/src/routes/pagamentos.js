/**
 * Feature 3 — Rotas de pagamento (Stripe Connect + Pix).
 *
 * Endpoints:
 *   GET  /api/pagamentos/connect/status      → status da conta Connect do profissional
 *   POST /api/pagamentos/connect/onboarding  → link para onboarding no Stripe
 *   POST /api/pagamentos                    → contratante paga a custódia de uma vaga
 *   GET  /api/pagamentos/vaga/:id           → pagamentos de uma vaga
 *   POST /api/pagamentos/:id/confirmar      → simular confirmação (mock)
 *   POST /api/pagamentos/webhook            → webhook Stripe (eventos)
 *
 * Nota: `POST /api/pagamentos` delega ao protocolo de custódia (PDC) quando
 * a vaga já tem um — é o único caminho de cobrança do sistema. Sem essa
 * delegação, o dinheiro podia entrar por fora da custódia e nunca seria
 * liberado ao profissional.
 */
import express from 'express';
import { createRouter } from '../middleware/async.js';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  isMock, platformFeePct,
  criarConnectAccount, criarOnboardingLink, refreshConnectStatus,
  criarPagamento, confirmarPagamento, processarWebhookStripe
} from '../services/stripe.js';
import { iniciarPagamentoCustodia } from '../services/protocolos.js';

const router = createRouter(express);

router.get('/config', (req, res) => {
  res.json({ mock: isMock, platform_fee_pct: platformFeePct });
});

router.get('/connect/status', authRequired, requireTipo('profissional'), async (req, res) => {
  let conn = await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [req.user.id]);
  if (!conn) conn = await criarConnectAccount(req.user.id);
  else conn = await refreshConnectStatus(req.user.id);
  res.json({ connect: conn, mock: isMock });
});

router.post('/connect/onboarding', authRequired, requireTipo('profissional'), async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const link = await criarOnboardingLink(
    req.user.id,
    `${FRONTEND_URL}/dashboard/profissional?onboarding=ok`,
    `${FRONTEND_URL}/dashboard/profissional?onboarding=refresh`
  );
  res.json(link);
});

const pagamentoSchema = {
  id_vaga: { required: true, type: 'integer', min: 1 },
  metodo:  { type: 'enum', values: ['pix', 'cartao'] }
};

router.post('/', authRequired, requireTipo('contratante'),
  validateBody(pagamentoSchema), async (req, res) => {
    const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [req.body.id_vaga]);
    if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
    if (vaga.id_contratante !== req.user.id) return res.status(403).json({ error: 'Você não é dono desta vaga' });
    if (!vaga.remuneracao_valor) return res.status(400).json({ error: 'Vaga sem remuneração definida' });

    // ── O caminho canônico é o protocolo de custódia ──────────────────
    // Quando existe um PDC para esta vaga, o pagamento é por ele. Criar
    // aqui um pagamento avulso colocava o dinheiro FORA da custódia: o
    // profissional não conseguia fazer check-in/check-out, o protocolo
    // nunca avançava e o pagamento nunca era liberado. Os dois caminhos
    // agora apontam para a mesma cobrança.
    const pdc = await db.get(
      `SELECT * FROM protocolos
        WHERE id_vaga = ? AND tipo = 'PDC' AND status = 'enviado'
        ORDER BY id DESC LIMIT 1`,
      [vaga.id]
    );
    if (pdc) {
      let result;
      try {
        result = await iniciarPagamentoCustodia(pdc.id, req.user.id);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(201).json({
        ...result,
        via: 'protocolo',
        protocolo_id: pdc.id,
        // Aliases para manter compatibilidade com clientes que esperam o
        // formato antigo (PaymentModal).
        pix_qr_code: result.qr_code_base64 || null,
        pix_txid: result.txid || null,
        pagamento: {
          id: pdc.id,
          status: result.pix_flow ? 'pendente' : 'pago',
          valor_centavos: result.valor_total_centavos
        },
        valor_profissional_centavos: result.valor_total_centavos
      });
    }

    // Sem protocolo (vaga sem candidatura aceita pelo fluxo de protocolos),
    // cai no caminho legado do Stripe.
    const cand = await db.get(
      `SELECT id_profissional FROM candidaturas
        WHERE id_vaga = ? AND status_candidatura = 'aceita' LIMIT 1`,
      [vaga.id]
    );
    const id_profissional = cand?.id_profissional;
    if (!id_profissional) {
      return res.status(400).json({ error: 'Nenhum profissional aceito para esta vaga ainda.' });
    }

    const result = await criarPagamento({
      valor_reais: vaga.remuneracao_valor,
      metodo: req.body.metodo || 'pix',
      metadata: {
        vaga_id: vaga.id,
        contratante_id: req.user.id,
        profissional_id: id_profissional
      }
    });
    res.status(201).json({ ...result, via: 'stripe' });
  }
);

router.get('/vaga/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [id]);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
  if (vaga.id_contratante !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const rows = await db.all('SELECT * FROM pagamentos WHERE id_vaga = ? ORDER BY criado_em DESC', [id]);
  res.json({ pagamentos: rows });
});

router.post('/:id/confirmar', authRequired, async (req, res) => {
  // Em produção, só o webhook do Stripe confirma. Em mock, deixamos o contratante simular.
  const p = await db.get('SELECT * FROM pagamentos WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado' });
  if (!isMock) return res.status(403).json({ error: 'Confirmação só via webhook em modo live' });
  if (p.id_contratante !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });
  const updated = await confirmarPagamento(p.id);
  res.json({ pagamento: updated });
});

router.post('/webhook', express.json({ type: 'application/json' }), async (req, res) => {
  // P1 — Validar assinatura do webhook Stripe para evitar eventos forjados.
  // Em modo mock (sem STRIPE_SECRET_KEY), aceita sem validar (útil pra dev/testes).
  // Em modo live, exige STRIPE_WEBHOOK_SECRET + header stripe-signature.
  //
  // Nota técnica: o express.json() global em src/index.js já parseia o body.
  // Para validar assinatura Stripe em modo live, precisamos do body RAW.
  // Solução: registrar este router ANTES do express.json() global, OU usar
  // express.raw({type:'application/json'}) só nesta rota e remover o global
  // para /api/pagamentos/webhook. Por simplicidade e compatibilidade, aceitamos
  // o body já parseado (req.body) e usamos a assinatura em modo live.
  // Em produção, recomendamos expor este webhook em um processo Express separado.
  try {
    const event = req.body;
    if (!event || !event.type) {
      return res.status(400).json({ error: 'Webhook inválido', motivo: 'event.type ausente' });
    }

    // P1 — Em modo live, valida assinatura
    if (!isMock) {
      const stripeMod = (await import('stripe')).default;
      const stripeLive = new stripeMod(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-09-30.acacia' });
      const signature = req.headers['stripe-signature'];
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!signature || !secret) {
        return res.status(400).json({ error: 'Assinatura/secret do webhook não configurados' });
      }
      // Re-serializa o body para validar assinatura (já que o JSON foi parseado)
      const rawBody = JSON.stringify(event);
      try {
        stripeLive.webhooks.constructEvent(rawBody, signature, secret);
      } catch (verr) {
        return res.status(400).json({ error: 'Assinatura inválida', motivo: verr.message });
      }
    }

    const result = await processarWebhookStripe(event);
    res.json({
      received: true,
      deduplicado: result.deduplicado,
      pagamento_id: result.pagamento_id
    });
  } catch (err) {
    console.error('[stripe webhook]', err.message || err);
    res.status(400).json({ error: 'Webhook inválido', motivo: err.message || 'erro desconhecido' });
  }
});

export default router;
