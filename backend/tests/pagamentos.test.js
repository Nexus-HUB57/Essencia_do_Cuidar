import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('GET /api/pagamentos/config', () => {
  beforeEach(async () => { await resetDb(); });

  it('expõe a configuração de pagamento ao público', async () => {
    const r = await (await api()).get('/api/pagamentos/config');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('mock');
    expect(r.body).toHaveProperty('platform_fee_pct');
  });
});

describe('POST /api/pagamentos/connect/onboarding', () => {
  beforeEach(async () => { await resetDb(); });

  it('profissional cria conta Connect (mock)', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/pagamentos/connect/onboarding').set(auth(p.token));
    expect(r.status).toBe(200);
    expect(r.body.url).toBeTruthy();
  });

  it('contratante não cria conta Connect (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/pagamentos/connect/onboarding').set(auth(c.token));
    expect(r.status).toBe(403);
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).post('/api/pagamentos/connect/onboarding');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/pagamentos', () => {
  beforeEach(async () => { await resetDb(); });

  it('contratante cria pagamento para candidato de vaga aceita', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const cad = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    await (await api()).patch(`/api/candidaturas/${cad.body.candidatura.id}`)
      .set(auth(c.token)).send({ status_candidatura: 'aceita' });

    const r = await (await api()).post('/api/pagamentos').set(auth(c.token)).send({
      id_vaga: v.id, id_profissional: p.id, metodo: 'pix', valor_centavos: 12000
    });
    expect(r.status).toBe(201);
    expect(r.body.pagamento.valor_centavos).toBe(12000);
    expect(r.body.pagamento.status).toBeTruthy();
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).post('/api/pagamentos').send({ id_vaga: 1, valor_centavos: 100 });
    expect(r.status).toBe(401);
  });

  it('profissional não cria pagamento (403)', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/pagamentos').set(auth(p.token)).send({
      id_vaga: 1, id_profissional: 1, metodo: 'pix', valor_centavos: 100
    });
    expect(r.status).toBe(403);
  });
});

describe('GET /api/pagamentos/vaga/:id', () => {
  beforeEach(async () => { await resetDb(); });

  it('lista pagamentos de uma vaga', async () => {
    const a = await createUser({ is_admin: 1 });
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).get(`/api/pagamentos/vaga/${v.id}`).set(auth(a.token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.pagamentos)).toBe(true);
  });
});

describe('serviço de Stripe (modo mock)', () => {
  beforeEach(async () => { await resetDb(); });

  it('isMock é true sem STRIPE_SECRET_KEY', async () => {
    const stripe = await import('../src/services/stripe.js');
    expect(stripe.isMock).toBe(true);
  });

  it('cria uma conta Connect mock com id fake', async () => {
    const stripe = await import('../src/services/stripe.js');
    const p = await createUser({ tipo_usuario: 'profissional' });
    const conta = await stripe.criarConnectAccount(p.id);
    expect(conta.stripe_account_id).toMatch(/^acct_mock_/);
  });

  it('onboarding mock devolve URL com mock_onboarding=1', async () => {
    const stripe = await import('../src/services/stripe.js');
    const p = await createUser({ tipo_usuario: 'profissional' });
    const res = await stripe.criarOnboardingLink(p.id, 'http://localhost:5173');
    expect(res.mock).toBe(true);
    expect(res.url).toContain('mock_onboarding=1');
  });

  it('criarPagamento mock gera payment intent fake e calcula fee', async () => {
    const stripe = await import('../src/services/stripe.js');
    const c = await createUser({ tipo_usuario: 'contratante' });
    const prof = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const r = await stripe.criarPagamento({
      valor_reais: 120,
      metodo: 'pix',
      metadata: { vaga_id: v.id, contratante_id: c.id, profissional_id: prof.id }
    });
    expect(r.pagamento.stripe_payment_intent_id).toMatch(/^pi_mock_/);
    expect(r.pix_qr_code).toBeTruthy();
    expect(r.pix_txid).toMatch(/^MOCKPIX/);
    // fee de 10% sobre R$ 120,00 = R$ 12,00 = 1200 centavos
    expect(r.fee_centavos).toBe(1200);
    expect(r.valor_profissional_centavos).toBe(12000 - 1200);
  });

  it('rejeita valor abaixo de R$ 1,00', async () => {
    const stripe = await import('../src/services/stripe.js');
    await expect(
      stripe.criarPagamento({ valor_reais: 0.5, metodo: 'pix', metadata: {} })
    ).rejects.toThrow(/mínimo/i);
  });
});
