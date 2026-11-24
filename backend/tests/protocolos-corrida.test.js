/**
 * Teste de REGRESSÃO para a corrida de liberação de pagamento.
 *
 * Contexto: `liberarPagamento()` é chamado por três caminhos independentes
 *   1. rota admin  → POST /api/protocolos/:id/liberar
 *   2. cron        → liberarPagamentosApos72h()
 *   3. PPP/PNP    → protocolos-ppp-pnp.js
 *
 * Sem uma trava, duas execuções da mesma liberação se sobrepõem: ambas leem
 * `status = 'checkout_completo'` e ambas transferem o dinheiro ao
 * profissional — ele recebe duas vezes.
 *
 * A correção é uma reivindicação atômica (INSERT com PK em
 * `protocolo_liberamento_claim`) antes de mover o dinheiro: exatamente uma
 * execução passa, a outra percebe que já estão atendendo o protocolo.
 *
 * O detector exato de liberação dupla é o `protocolo_status_log`: cada
 * liberação registra a transição 'checkout_completo' → 'liberado'. Duas
 * liberações concorrentes deixariam DUAS linhas.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getApp, resetDb, createUser, createVaga, api } from './helpers.js';
import db from '../src/db/driver.js';

// Atrasa a transferência em 300ms. Isso abre, de forma determinística, a
// janela em que as duas liberações concorrentes já leram o status
// ('checkout_completo') mas nenhuma escreveu ainda — exatamente o cenário
// do double-spend. Sem a trava de reivindicação, as duas transferem.
vi.mock('../src/services/stripe.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    transferirParaProfissional: async (args) => {
      await new Promise(r => setTimeout(r, 300));
      return real.transferirParaProfissional(args);
    }
  };
});

const req = await api();
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function montarFluxoPago() {
  const contratante = await createUser({ tipo_usuario: 'contratante', nome: 'Ana Contratante' });
  const profissional = await createUser({ tipo_usuario: 'profissional', nome: 'Bruno Profissional' });
  const vaga = await createVaga(contratante.id, { remuneracao_valor: 200, remuneracao_tipo: 'hora' });

  const cand = await req.post('/api/candidaturas').set(auth(profissional.token))
    .send({ id_vaga: vaga.id, mensagem: 'Tenho experiência com o caso.' });
  const candidaturaId = cand.body.candidatura.id;

  await req.patch(`/api/candidaturas/${candidaturaId}`).set(auth(contratante.token))
    .send({ status_candidatura: 'aceita' });

  const listaPcm = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
  const pcm = listaPcm.body.protocolos.find(p => p.status === 'enviado');

  const aceitePcm = await req.post(`/api/protocolos/${pcm.id}/aceitar`).set(auth(profissional.token));
  const pdcId = aceitePcm.body.pdc.id;

  const pagamento = await req.post(`/api/protocolos/${pdcId}/pagar`).set(auth(contratante.token));
  expect(pagamento.status).toBeLessThan(300);

  return { contratante, profissional, pdcId };
}

describe('Protocolos — corrida na liberação de pagamento', () => {
  beforeEach(async () => {
    await getApp();
    await resetDb();
  });

  it('liberações concorrentes liberam o protocolo uma única vez', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    // Trilha Stripe: assim há transferência de verdade (mock) e um
    // `stripe_transfer_id` gravado para conferirmos o repasse.
    await db.run(
      `UPDATE pagamentos_custodia SET stripe_payment_intent_id = 'pi_test_corrida' WHERE id_protocolo = ?`,
      [pdcId]
    );

    // Deixa o PDC pronto para liberação (check-in + check-out + avaliação)
    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({ nota: 5 });

    const antes = await db.get('SELECT status FROM protocolos WHERE id = ?', [pdcId]);
    expect(antes.status).toBe('checkout_completo');

    // Duas liberações CONCOMITENTES — como o admin clicar no botão enquanto
    // o cron de 72h roda.
    const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
    const [r1, r2] = await Promise.all([
      req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token)),
      req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token))
    ]);

    const jaLiberado = [r1, r2].filter(r => r.body?.ja_liberado === true);

    console.log('>>> RESPOSTAS CONCORRENTES:', JSON.stringify({
      r1: { status: r1.status, body: r1.body },
      r2: { status: r2.status, body: r2.body }
    }, null, 1));

    // Nenhuma das duas pode falhar: quem perdeu a corrida recebe
    // 'ja_liberado' (a outra já está liberando).
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // E exatamente uma delas é a que efetivamente liberou.
    expect(jaLiberado.length).toBe(1);

    const depois = await db.get('SELECT status FROM protocolos WHERE id = ?', [pdcId]);
    expect(depois.status).toBe('liberado');

    // ── Detector exato de liberação dupla ──────────────────────────────
    // Cada liberação registra a transição 'checkout_completo' → 'liberado'.
    // Duas liberações concorrentes deixariam DUAS linhas no log.
    const transicoes = await db.get(
      `SELECT COUNT(*) AS n FROM protocolo_status_log
        WHERE id_protocolo = ? AND status_anterior = 'checkout_completo' AND status_novo = 'liberado'`,
      [pdcId]
    );
    console.log('>>> LIBERAÇÕES EFETIVAS:', transicoes.n);
    expect(transicoes.n).toBe(1);

    // O repasse ao profissional foi registrado uma única vez.
    const custodia = await db.get(
      'SELECT stripe_transfer_id FROM pagamentos_custodia WHERE id_protocolo = ?', [pdcId]
    );
    expect(custodia.stripe_transfer_id).toBeTruthy();

    // A reivindicação não pode ficar pendurada (trava órfã).
    const claim = await db.get(
      'SELECT id_protocolo FROM protocolo_liberamento_claim WHERE id_protocolo = ?', [pdcId]
    );
    expect(claim).toBeFalsy();
  });

  it('liberação sequencial continua idempotente', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({ nota: 5 });

    const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
    const primeira = await req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token));
    expect(primeira.status).toBe(200);

    const segunda = await req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token));
    expect(segunda.status).toBe(200);
    expect(segunda.body.ja_liberado).toBe(true);

    const transicoes = await db.get(
      `SELECT COUNT(*) AS n FROM protocolo_status_log
        WHERE id_protocolo = ? AND status_anterior = 'checkout_completo' AND status_novo = 'liberado'`,
      [pdcId]
    );
    expect(transicoes.n).toBe(1);
  });
});
