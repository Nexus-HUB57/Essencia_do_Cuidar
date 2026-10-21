/**
 * Feature 3 — Stripe Connect + Pix para pagamentos do marketplace.
 *
 * Pattern: marketplace com Stripe Connect Express.
 *   - Profissional cria uma "Connect account" e onboarda via Stripe-hosted form
 *   - Contratante paga via Pix ou cartão
 *   - Split automático: 90% profissional, 10% plataforma (configurável)
 *
 * Para testes sem Stripe real, defina STRIPE_MOCK=true no .env — o módulo
 * simula o fluxo e persiste em `pagamentos` com status apropriado.
 */
import db from '../db/driver.js';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_MOCK = process.env.STRIPE_MOCK === 'true' || !STRIPE_SECRET;
const PLATFORM_FEE_PCT = Number(process.env.PLATFORM_FEE_PCT || 10); // 10% plataforma
const PLATFORM_FEE_MIN = 100; // R$ 1,00 mínimo em centavos

let stripe = null;
if (!STRIPE_MOCK && STRIPE_SECRET) {
  // Import dinâmico para evitar quebrar quando stripe não está instalado
  try {
    const Stripe = (await import('stripe')).default;
    stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-09-30.acacia' });
    console.log('[stripe] SDK carregado — modo live');
  } catch (e) {
    console.warn('[stripe] SDK não disponível, caindo para MOCK:', e.message);
  }
} else {
  console.log('[stripe] MOCK mode — fluxos simulados, nada é cobrado de verdade');
}

export const isMock = STRIPE_MOCK;
export const platformFeePct = PLATFORM_FEE_PCT;

/**
 * Cria (ou retorna) uma Connect Account para o profissional.
 * Em mock, devolve um ID fake.
 */
export async function criarConnectAccount(userId) {
  const existente = await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [userId]);
  if (existente) return existente;

  let stripeAccountId = `acct_mock_${userId}_${Date.now()}`;
  if (!STRIPE_MOCK && stripe) {
    const acc = await stripe.accounts.create({
      type: 'express',
      country: 'BR',
      email: undefined, // preenchido no onboarding
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } }
    });
    stripeAccountId = acc.id;
  }
  const r = await db.run(
    `INSERT INTO stripe_connect (id_user, stripe_account_id, charges_enabled, payouts_enabled, detalhes_submetidos)
     VALUES (?, ?, 0, 0, 0)`,
    [userId, stripeAccountId]
  );
  return await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [userId]);
}

/**
 * Cria o "Account Link" para o profissional completar o onboarding no Stripe.
 * Em mock, devolve uma URL fake para o frontend simular.
 */
export async function criarOnboardingLink(userId, returnUrl, refreshUrl) {
  const conn = await criarConnectAccount(userId);
  if (STRIPE_MOCK || !stripe) {
    return { url: `${returnUrl}?mock_onboarding=1&acct=${conn.stripe_account_id}`, mock: true };
  }
  const link = await stripe.accountLinks.create({
    account: conn.stripe_account_id,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding'
  });
  return { url: link.url, mock: false };
}

/**
 * Verifica status da conta Connect e atualiza localmente.
 */
export async function refreshConnectStatus(userId) {
  const conn = await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [userId]);
  if (!conn) return null;
  if (STRIPE_MOCK || !stripe) {
    // Em mock, considera a conta "ativa" para fins de demo
    await db.run(
      'UPDATE stripe_connect SET charges_enabled = 1, payouts_enabled = 1, detalhes_submetidos = 1, atualizado_em = datetime(\'now\') WHERE id_user = ?',
      [userId]
    );
    return await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [userId]);
  }
  const acc = await stripe.accounts.retrieve(conn.stripe_account_id);
  await db.run(
    `UPDATE stripe_connect SET
       charges_enabled = ?, payouts_enabled = ?, detalhes_submetidos = ?,
       atualizado_em = datetime('now')
     WHERE id_user = ?`,
    [acc.charges_enabled ? 1 : 0, acc.payouts_enabled ? 1 : 0, acc.details_submitted ? 1 : 0, userId]
  );
  return await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [userId]);
}

/**
 * Cria um PaymentIntent para o contratante pagar uma vaga.
 * O dinheiro fica retido no Stripe até o split (transfer para o profissional).
 *
 *   valor_reais: ex 250.00
 *   metadata: { vaga_id, contratante_id, profissional_id }
 */
export async function criarPagamento({ valor_reais, metodo = 'pix', metadata }) {
  const valor_centavos = Math.round(valor_reais * 100);
  if (valor_centavos < 100) throw new Error('Valor mínimo é R$ 1,00');

  // Calcula a fee da plataforma em centavos
  const fee_centavos = Math.max(Math.round(valor_centavos * PLATFORM_FEE_PCT / 100), PLATFORM_FEE_MIN);
  const valor_profissional_centavos = valor_centavos - fee_centavos;

  // Garante que o profissional tem conta Connect
  await criarConnectAccount(metadata.profissional_id);

  let paymentIntentId = `pi_mock_${Date.now()}`;
  let pixQrCode = null;
  let pixTxid = null;
  let clientSecret = null;

  if (!STRIPE_MOCK && stripe) {
    const conn = await db.get('SELECT stripe_account_id FROM stripe_connect WHERE id_user = ?', [metadata.profissional_id]);
    const piParams = {
      amount: valor_centavos,
      currency: 'brl',
      payment_method_types: metodo === 'pix' ? ['pix'] : ['card'],
      application_fee_amount: fee_centavos,
      transfer_data: { destination: conn.stripe_account_id },
      metadata
    };
    const pi = await stripe.paymentIntents.create(piParams);
    paymentIntentId = pi.id;
    clientSecret = pi.client_secret;
    if (metodo === 'pix' && pi.next_action?.pix_display_qr_code) {
      pixQrCode = pi.next_action.pix_display_qr_code.data;
      pixTxid = pi.next_action.pix_display_qr_code.external_id;
    }
  } else {
    // Mock — gera um "txid" fake
    pixTxid = `MOCKPIX${Date.now()}`;
    pixQrCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }

  // Cria o registro
  const info = await db.run(
    `INSERT INTO pagamentos
      (id_vaga, id_contratante, id_profissional, valor_centavos, moeda, metodo,
       status, stripe_payment_intent_id, pix_txid, pix_qr_code)
     VALUES (?, ?, ?, ?, 'brl', ?, 'pendente', ?, ?, ?)`,
    [metadata.vaga_id, metadata.contratante_id, metadata.profissional_id,
     valor_centavos, metodo, paymentIntentId, pixTxid, pixQrCode]
  );
  const pagamento = await db.get('SELECT * FROM pagamentos WHERE id = ?', [info.lastInsertRowid]);

  return {
    pagamento,
    client_secret: clientSecret,
    pix_qr_code: pixQrCode,
    pix_txid: pixTxid,
    fee_centavos,
    valor_profissional_centavos
  };
}

/**
 * Confirma pagamento (em produção, isso vem do webhook do Stripe).
 * Em mock, simula confirmação imediata.
 */
export async function confirmarPagamento(pagamentoId) {
  const p = await db.get('SELECT * FROM pagamentos WHERE id = ?', [pagamentoId]);
  if (!p) throw new Error('Pagamento não encontrado');
  if (p.status === 'pago') return p;

  await db.run(
    `UPDATE pagamentos SET status = 'pago', atualizado_em = datetime('now') WHERE id = ?`,
    [pagamentoId]
  );
  return await db.get('SELECT * FROM pagamentos WHERE id = ?', [pagamentoId]);
}

/**
 * Webhook do Stripe — em produção, valida signature e processa eventos.
 */
export async function processarWebhookStripe(event) {
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const p = await db.get('SELECT * FROM pagamentos WHERE stripe_payment_intent_id = ?', [pi.id]);
    if (p) {
      await confirmarPagamento(p.id);
    }
  }
}
