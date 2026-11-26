/**
 * tests/plantoes.test.js
 *
 * Plantões avulsos via Payment Link do Mercado Pago.
 *
 * Roda em modo mock (sem MERCADOPAGO_ACCESS_TOKEN o serviço entra em mock):
 * o checkout devolve a URL real do Mercado Pago (redirect com link-id +
 * external_reference) e a confirmação é simulada pelo endpoint /confirmar —
 * em produção quem marca 'pago' é o webhook.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, auth } from './helpers.js';
import db from '../src/db/driver.js';
import { processarWebhook } from '../src/services/mercadopago.js';

describe('GET /api/plantoes — catálogo público', () => {
  beforeEach(async () => { await resetDb(); });

  it('traz os 6 plantões (enfermagem + cuidador, 12/8/6h) com o preço', async () => {
    const r = await (await api()).get('/api/plantoes');
    expect(r.status).toBe(200);
    expect(r.body.plantoes).toHaveLength(6);
    for (const p of r.body.plantoes) {
      expect(p.preco_centavos).toBeGreaterThan(0);
      expect(p.preco_formatado).toMatch(/^R\$/);
    }
    // preços conferidos contra os checkouts reais do MP (não presumidos)
    const precos = Object.fromEntries(r.body.plantoes.map(p => [p.id, p.preco_centavos]));
    expect(precos['enfermagem-12h']).toBe(25000);
    expect(precos['enfermagem-8h']).toBe(20000);
    expect(precos['enfermagem-6h']).toBe(15000);
    expect(precos['cuidador-12h']).toBe(20000);
    expect(precos['cuidador-8h']).toBe(18000);
    expect(precos['cuidador-6h']).toBe(12000);
  });

  it('filtro familia=cuidador traz só os 3 plantões de cuidador', async () => {
    const r = await (await api()).get('/api/plantoes?familia=cuidador');
    expect(r.status).toBe(200);
    expect(r.body.plantoes).toHaveLength(3);
    expect(r.body.plantoes.every(p => p.familia === 'cuidador')).toBe(true);
  });

  it('filtro familia=enfermagem traz só os 3 de enfermagem', async () => {
    const r = await (await api()).get('/api/plantoes?familia=enfermagem');
    expect(r.status).toBe(200);
    expect(r.body.plantoes).toHaveLength(3);
  });

  it('família inválida → 400 com as famílias válidas', async () => {
    const r = await (await api()).get('/api/plantoes?familia=pedreiro');
    expect(r.status).toBe(400);
    expect(r.body.familias_validas).toContain('enfermagem');
    expect(r.body.familias_validas).toContain('cuidador');
  });
});

describe('POST /api/plantoes/:id/checkout', () => {
  beforeEach(async () => { await resetDb(); });

  it('checkout sem token → 401', async () => {
    const r = await (await api()).post('/api/plantoes/enfermagem-6h/checkout').send({});
    expect(r.status).toBe(401);
  });

  it('plantão inexistente → 404', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/plantoes/enfermagem-99h/checkout').set(auth(c.token)).send({});
    expect(r.status).toBe(404);
  });

  it('checkout registra intenção pendente e devolve URL do MP com external_reference', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/plantoes/enfermagem-8h/checkout').set(auth(c.token)).send({});
    expect(r.status).toBe(201);

    // A URL é a de redirect oficial (o short link mpago.la descarta query
    // string — descoberta verificada no checkout real em 23/11/2026).
    expect(r.body.checkout_url).toMatch(/^https:\/\/www\.mercadopago\.com\.br\/payment-link\/v1\/redirect\?/);
    expect(r.body.checkout_url).toContain('link-id=DEMO-ENF-8H');
    expect(r.body.checkout_url).toContain(`external_reference=${r.body.external_reference}`);
    expect(r.body.external_reference).toMatch(/^PLANTAO-enfermagem-8h-/);

    const pag = await db.get('SELECT * FROM pagamentos_link WHERE external_reference = ?', [r.body.external_reference]);
    expect(pag.status).toBe('pendente');
    expect(pag.valor_centavos).toBe(20000);
    expect(pag.titulo).toBe('Plantão de Enfermagem — 8 horas');
  });
});

describe('status, confirmação (mock) e isolamento', () => {
  beforeEach(async () => { await resetDb(); });

  async function contratar(user, plantao = 'cuidador-6h') {
    const r = await (await api()).post(`/api/plantoes/${plantao}/checkout`).set(auth(user.token)).send({});
    return { ref: r.body.external_reference, url: r.body.checkout_url };
  }

  it('pagamento começa como pendente e o dono consulta o status', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const { ref } = await contratar(c);
    const r = await (await api()).get(`/api/plantoes/status/${ref}`).set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.pagamento.status).toBe('pendente');
  });

  it('pagamento alheio não é acessível → 404', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const outro = await createUser({ tipo_usuario: 'contratante', email: 'outro@demo.com' });
    const { ref } = await contratar(c);
    const r = await (await api()).get(`/api/plantoes/status/${ref}`).set(auth(outro.token));
    expect(r.status).toBe(404);
  });

  it('confirmação (mock) reconcilia para pago', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const { ref } = await contratar(c);
    const r = await (await api()).post(`/api/plantoes/status/${ref}/confirmar`).set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.pagamento.status).toBe('pago');
    expect(r.body.pagamento.pago_em).toBeTruthy();

    // status consultado depois já mostra pago
    const depois = await (await api()).get(`/api/plantoes/status/${ref}`).set(auth(c.token));
    expect(depois.body.pagamento.status).toBe('pago');
  });

  it('confirmação é idempotente — repetir não quebra', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const { ref } = await contratar(c);
    await (await api()).post(`/api/plantoes/status/${ref}/confirmar`).set(auth(c.token));
    const r = await (await api()).post(`/api/plantoes/status/${ref}/confirmar`).set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.pagamento.status).toBe('pago');
  });

  it('alheio não confirma pagamento dos outros → 404', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const outro = await createUser({ tipo_usuario: 'contratante', email: 'intruso@demo.com' });
    const { ref } = await contratar(c);
    const r = await (await api()).post(`/api/plantoes/status/${ref}/confirmar`).set(auth(outro.token));
    expect(r.status).toBe(404);
  });

  it('GET /api/plantoes/meus lista o histórico do usuário', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    await contratar(c, 'enfermagem-12h');
    await contratar(c, 'cuidador-6h');
    const r = await (await api()).get('/api/plantoes/meus').set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.pagamentos).toHaveLength(2);
    expect(r.body.pagamentos.every(p => p.external_reference.startsWith('PLANTAO-'))).toBe(true);
  });

  it('webhook do Mercado Pago marca o plantão como pago pelo external_reference', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const { ref } = await contratar(c, 'enfermagem-6h');

    const resultado = await processarWebhook({
      action: 'payment.updated',
      data: { id: '778899' },
      external_reference: ref   // MP payment link carrega a reference
    });
    expect(resultado.processado).toBe(true);
    expect(resultado.aprovado).toBe(true);
    expect(resultado.plantao).toBe('enfermagem-6h');

    const pag = await db.get('SELECT * FROM pagamentos_link WHERE external_reference = ?', [ref]);
    expect(pag.status).toBe('pago');
    expect(pag.mp_payment_id).toBe('778899');

    // webhook repetido (MP reenvia) é idempotente
    const deNovo = await processarWebhook({ data: { id: '778899' }, external_reference: ref });
    expect(deNovo.ja_estava_pago).toBe(true);
  });

  it('webhook com reference de plantão desconhecida não quebra', async () => {
    const resultado = await processarWebhook({
      data: { id: '112233' },
      external_reference: 'PLANTAO-enfermagem-6h-9999999999-XXXXXX'
    });
    expect(resultado.processado).toBe(false);
    expect(resultado.erro).toMatch(/não encontrado/);
  });
});
