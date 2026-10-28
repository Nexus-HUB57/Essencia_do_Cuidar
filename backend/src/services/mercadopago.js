/**
 * services/mercadopago.js
 *
 * Integração Mercado Pago — Pix real para Protocolo de Débito de Custódia (PDC).
 *
 * Quando o contratante paga o PDC, este módulo:
 *   1. Cria um "Pix QR Code" via API do Mercado Pago (POST /v1/payments)
 *   2. Retorna QR Code (base64) + txid para o contratante escanear
 *   3. Webhook do Mercado Pago (POST /api/webhooks/mercadopago) confirma pagamento
 *   4. Após confirmação, chama pagarPDC() no protocolos.js → status 'em_custodia'
 *
 * Para testes sem credenciais, MERCADOPAGO_MOCK=true gera um Pix QR fake.
 *
 * Env vars:
 *   MERCADOPAGO_ACCESS_TOKEN — access token da conta MP (server-side)
 *   MERCADOPAGO_PUBLIC_KEY   — public key (client-side, opcional)
 *   MERCADOPAGO_WEBHOOK_URL  — URL pública que o MP vai chamar (ex: https://api.essencia.../webhooks/mercadopago)
 *   MERCADOPAGO_MOCK         — 'true' = modo mock (sem credenciais)
 *
 * Nota: este módulo NÃO substitui o Stripe Connect (que continua sendo usado
 * para transfer ao profissional). Apenas substitui o método de pagamento
 * inicial do contratante (Pix via MP em vez de Pix via Stripe).
 */
import db from '../db/driver.js';

const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_MOCK = process.env.MERCADOPAGO_MOCK === 'true' || !MP_TOKEN;
const MP_API = 'https://api.mercadopago.com/v1';

export const isMock = MP_MOCK;

/**
 * Cria uma cobrança Pix no Mercado Pago para um PDC.
 *
 * @param {Object} dados - { protocolo_id, valor_centavos, descricao, contratante_id, metadata }
 * @returns {Promise<Object>} { txid, qr_code_base64, qr_code_texto, payment_id, status }
 */
export async function criarCobrancaPix({ protocolo_id, valor_centavos, descricao, contratante_id, metadata }) {
  if (valor_centavos < 100) throw new Error('Valor mínimo é R$ 1,00');

  const valor_reais = (valor_centavos / 100).toFixed(2);

  if (MP_MOCK) {
    // Mock — gera txid + QR fake
    const txid = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const payment_id = `mock_pay_${Date.now()}`;
    const qr_code_base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    console.log(`[mercadopago] MOCK: cobrança Pix criada para protocolo ${protocolo_id} (R$ ${valor_reais})`);
    return {
      txid,
      qr_code_base64,
      qr_code_texto: `00020126360014BR.GOV.BCB.PIX0114${txid}5204000053039865802BR5913ESSDO CUIDAR6009SAO PAULO62070503***6304ABCD`,
      payment_id,
      status: 'pending',
      mock: true
    };
  }

  // Live — chama API do Mercado Pago
  const body = {
    transaction_amount: Number(valor_reais),
    description: descricao || `Protocolo de Custódia #${protocolo_id}`,
    payment_method_id: 'pix',
    payer: { email: metadata?.contratante_email || 'contratante@essencia-do-cuidar.app' },
    metadata: {
      protocolo_id: String(protocolo_id),
      contratante_id: String(contratante_id),
      ...Object.fromEntries(
        Object.entries(metadata || {}).map(([k, v]) => [k, String(v)])
      )
    },
    notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || undefined
  };

  const r = await fetch(`${MP_API}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MP_TOKEN}`,
      'X-Idempotency-Key': `pdc-${protocolo_id}-${Date.now()}`
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Mercado Pago API ${r.status}: ${err}`);
  }

  const data = await r.json();

  // MP retorna o QR code em data.point_of_interaction.transaction_data
  const tx_data = data.point_of_interaction?.transaction_data;
  return {
    txid: tx_data?.qr_code || data.id?.toString(),
    qr_code_base64: `data:image/png;base64,${tx_data?.qr_code_base64 || ''}`,
    qr_code_texto: tx_data?.qr_code || '',
    payment_id: String(data.id),
    status: data.status,  // 'pending', 'approved', 'rejected'
    mock: false
  };
}

/**
 * Consulta status de um pagamento no Mercado Pago.
 * @param {string|number} payment_id
 * @returns {Promise<Object>} { status, aprovado_em, valor_reais }
 */
export async function consultarPagamento(payment_id) {
  if (MP_MOCK) {
    // Mock — aprova automaticamente após 5s (simula confirmação)
    return { status: 'approved', aprovado_em: new Date().toISOString(), mock: true };
  }

  const r = await fetch(`${MP_API}/payments/${payment_id}`, {
    headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
  });
  if (!r.ok) throw new Error(`Mercado Pago API ${r.status}`);
  const data = await r.json();
  return {
    status: data.status,
    aprovado_em: data.date_approved || null,
    valor_reais: data.transaction_amount,
    mock: false
  };
}

/**
 * Processa webhook do Mercado Pago.
 * Estrutura típica: { action: 'payment.updated', data: { id: '12345' } }
 *
 * @param {Object} payload
 * @returns {Promise<Object>} { processado, protocolo_id, status }
 */
export async function processarWebhook(payload) {
  const paymentId = payload?.data?.id;
  if (!paymentId) return { processado: false, erro: 'payload.data.id ausente' };

  // Consulta status atual do pagamento
  const info = await consultarPagamento(paymentId);
  if (info.status !== 'approved') {
    return { processado: true, status: info.status, aprovado: false };
  }

  // Busca o pagamento na nossa DB pelo payment_id
  const pag = await db.get(
    'SELECT * FROM pagamentos_custodia WHERE stripe_payment_intent_id = ?',
    [String(paymentId)]
  );
  if (!pag) {
    console.warn(`[mercadopago] webhook para payment_id ${paymentId} não encontrado na DB`);
    return { processado: false, erro: 'pagamento não encontrado' };
  }

  // Marca como em_custodia e dispara fluxo de protocolos
  await db.run(
    `UPDATE pagamentos_custodia SET status = 'em_custodia', pago_em = datetime('now')
      WHERE id = ? AND status = 'pendente'`,
    [pag.id]
  );

  // Importa dinamicamente para evitar circular dependency
  const { pagarPDC } = await import('./protocolos.js');
  try {
    await pagarPDC(pag.id_protocolo, null);  // null = sistema (webhook)
    return { processado: true, aprovado: true, protocolo_id: pag.id_protocolo };
  } catch (err) {
    console.error('[mercadopago] Falha ao chamar pagarPDC:', err.message);
    return { processado: false, erro: err.message };
  }
}
