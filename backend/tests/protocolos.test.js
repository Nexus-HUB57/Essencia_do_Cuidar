/**
 * tests/protocolos.test.js
 *
 * Suíte do sistema de Protocolos (custódia de pagamentos) com cobertura
 * do fluxo completo de check-in / check-out:
 *
 *   aceitar candidatura → PCP + PCM → aceite do profissional → PDC →
 *   pagamento (custódia) → check-in → presença → check-out → check-out →
 *   checkout completo → liberação
 *
 * Cobre também as garantias de custódia que protegem o dinheiro do
 * profissional e do contratante.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, auth, createUser, createVaga, resetDb, getApp } from './helpers.js';
import db from '../src/db/driver.js';

let req;

/**
 * Leva o fluxo até o PDC pago (custódia ativa).
 * @returns {Promise<Object>} ids e tokens das duas partes + id do PDC
 */
async function montarFluxoPago() {
  const contratante = await createUser({ tipo_usuario: 'contratante', nome: 'Ana Contratante' });
  const profissional = await createUser({ tipo_usuario: 'profissional', nome: 'Bruno Profissional' });
  const vaga = await createVaga(contratante.id, { remuneracao_valor: 200, remuneracao_tipo: 'hora' });

  // Profissional se candidata
  const cand = await req
    .post('/api/candidaturas')
    .set(auth(profissional.token))
    .send({ id_vaga: vaga.id, mensagem: 'Tenho experiência com o caso.' });
  expect(cand.status).toBe(201);
  const candidaturaId = cand.body.candidatura.id;

  // Contratante aceita → cria PCP + PCM e fecha a vaga
  const aceite = await req
    .patch(`/api/candidaturas/${candidaturaId}`)
    .set(auth(contratante.token))
    .send({ status_candidatura: 'aceita' });
  expect(aceite.status).toBe(200);

  // Profissional aceita o PCM → gera PDC
  const listaPcm = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
  const pcm = listaPcm.body.protocolos.find(p => p.status === 'enviado');
  expect(pcm).toBeTruthy();

  const aceitePcm = await req
    .post(`/api/protocolos/${pcm.id}/aceitar`)
    .set(auth(profissional.token));
  expect(aceitePcm.status).toBe(200);
  const pdcId = aceitePcm.body.pdc.id;

  // Contratante paga a custódia (Pix em modo mock)
  const pagamento = await req
    .post(`/api/protocolos/${pdcId}/pagar`)
    .set(auth(contratante.token));
  expect(pagamento.status).toBe(200);

  return { contratante, profissional, vaga, candidaturaId, pcmId: pcm.id, pdcId };
}

/**
 * Estado atual de um protocolo (via API, para checar a coluna real).
 */
async function lerProtocolo(id, token) {
  const r = await req.get(`/api/protocolos/${id}`).set(auth(token));
  return r.body.protocolo;
}

beforeAll(async () => {
  req = await api();
});

beforeEach(async () => {
  await resetDb();
});

describe('Protocolos — check-in', () => {
  it('profissional registra o check-in e o protocolo passa a expor o timestamp', async () => {
    const { profissional, pdcId } = await montarFluxoPago();

    const r = await req
      .post(`/api/protocolos/${pdcId}/checkin`)
      .set(auth(profissional.token))
      .send({ latitude: -23.5505, longitude: -46.6333 });

    expect(r.status).toBe(200);
    expect(r.body.ja_feito).toBe(false);
    expect(r.body.checkin.tipo_user).toBe('profissional');
    expect(r.body.checkin.latitude).toBeCloseTo(-23.5505, 4);

    const protocolo = await lerProtocolo(pdcId, profissional.token);
    expect(protocolo.checkin_profissional_em).toBeTruthy();
  });

  it('check-in exige o pagamento da custódia (não existe antes do PDC pago)', async () => {
    const contratante = await createUser({ tipo_usuario: 'contratante' });
    const profissional = await createUser({ tipo_usuario: 'profissional' });
    const vaga = await createVaga(contratante.id, { remuneracao_valor: 150 });

    await req.post('/api/candidaturas').set(auth(profissional.token)).send({ id_vaga: vaga.id });
    const cand = await db.get(
      `SELECT id FROM candidaturas WHERE id_vaga = ? AND id_profissional = ?`,
      [vaga.id, profissional.id]
    );
    await req.patch(`/api/candidaturas/${cand.id}`).set(auth(contratante.token)).send({ status_candidatura: 'aceita' });

    const lista = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
    const pcm = lista.body.protocolos.find(p => p.status === 'enviado');
    const pdc = (await req.post(`/api/protocolos/${pcm.id}/aceitar`).set(auth(profissional.token))).body.pdc;

    // PDC ainda não pago → check-in deve ser recusado
    const r = await req
      .post(`/api/protocolos/${pdc.id}/checkin`)
      .set(auth(profissional.token))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/status/i);
  });

  it('check-in é idempotente: repetir devolve o registro existente sem duplicar', async () => {
    const { profissional, pdcId } = await montarFluxoPago();

    const primeiro = await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    const segundo = await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});

    expect(segundo.status).toBe(200);
    expect(segundo.body.ja_feito).toBe(true);
    expect(segundo.body.checkin.id).toBe(primeiro.body.checkin.id);

    const lista = await req.get(`/api/protocolos/${pdcId}/checkins`).set(auth(profissional.token));
    expect(lista.body.checkins.filter(c => c.tipo_user === 'profissional')).toHaveLength(1);
  });

  it('terceiro não pode registrar check-in em protocolo alheio', async () => {
    const { pdcId } = await montarFluxoPago();
    const intruso = await createUser({ tipo_usuario: 'profissional' });

    const r = await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(intruso.token)).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/autorizado/i);
  });

  it('contratante só confirma presença depois do check-in do profissional', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    const antes = await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(contratante.token)).send({});
    expect(antes.status).toBe(400);
    expect(antes.body.error).toMatch(/ainda não registrou/i);

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    const depois = await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(contratante.token)).send({});
    expect(depois.status).toBe(200);
    expect(depois.body.checkin.tipo_user).toBe('contratante');
  });

  it('o check-in é espelhado nos protocolos irmãos do mesmo plantão (PCP/PCM)', async () => {
    const { profissional, pdcId, pcmId } = await montarFluxoPago();

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});

    // PCP, PCM e PDC são três linhas do MESMO plantão. O timestamp de
    // chegada tem que aparecer em todas — senão o dashboard mostra um
    // card "Em plantão" e outro "Aguardando check-in" para o mesmo turno.
    const pdc = await db.get('SELECT id_vaga, id_candidatura FROM protocolos WHERE id = ?', [pdcId]);
    const linhas = await db.all(
      `SELECT tipo, checkin_profissional_em FROM protocolos
        WHERE id_vaga = ? AND id_candidatura = ?`,
      [pdc.id_vaga, pdc.id_candidatura]
    );
    expect(linhas.length).toBeGreaterThanOrEqual(3);
    for (const l of linhas) {
      expect(l.checkin_profissional_em, `protocolo ${l.tipo} sem espelhar o check-in`).toBeTruthy();
    }

    // O PCM continua acessível pelo profissional pela API (o painel o
    // esconde quando existe PDC, mas o dado tem que estar consistente).
    const lista = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
    const pcm = lista.body.protocolos.find(p => p.id === pcmId);
    expect(pcm.checkin_profissional_em).toBeTruthy();
  });
});

describe('Protocolos — check-out', () => {
  it('fluxo completo: check-in → presença → check-out → check-out → liberado', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    // 1. Profissional chega
    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    // 2. Contratante confirma presença
    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(contratante.token)).send({});
    // 3. Profissional finaliza o plantão
    const coProf = await req
      .post(`/api/protocolos/${pdcId}/checkout`)
      .set(auth(profissional.token))
      .send({ comentario: 'Plantão concluído.' });
    expect(coProf.status).toBe(200);
    expect(coProf.body.checkout_completo).toBe(false);

    let protocolo = await lerProtocolo(pdcId, contratante.token);
    expect(protocolo.status).toBe('checkout_profissional');

    // 4. Contratante confirma a execução
    const coContratante = await req
      .post(`/api/protocolos/${pdcId}/checkout`)
      .set(auth(contratante.token))
      .send({ nota: 5, comentario: 'Excelente profissional.' });
    expect(coContratante.status).toBe(200);
    expect(coContratante.body.checkout_completo).toBe(true);

    protocolo = await lerProtocolo(pdcId, contratante.token);
    expect(protocolo.status).toBe('checkout_completo');

    // 5. Liberação
    const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
    const lib = await req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token));
    expect(lib.status).toBe(200);

    protocolo = await lerProtocolo(pdcId, profissional.token);
    expect(protocolo.status).toBe('liberado');
    expect(protocolo.liberado_em).toBeTruthy();
  });

  it('contratante não fecha o plantão antes do profissional', async () => {
    const { contratante, pdcId } = await montarFluxoPago();

    const r = await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/ainda não confirmou/i);
  });

  it('check-out do profissional sem check-in cria check-in implícito (protocolo legado)', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    // Simula um protocolo anterior à feature: sem nenhum check-in registrado.
    await db.run('DELETE FROM protocolo_checkins WHERE id_protocolo = ?', [pdcId]);
    await db.run('UPDATE protocolos SET checkin_profissional_em = NULL WHERE id = ?', [pdcId]);

    const r = await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    expect(r.status).toBe(200);

    const checkins = await req.get(`/api/protocolos/${pdcId}/checkins`).set(auth(profissional.token));
    const prof = checkins.body.checkins.find(c => c.tipo_user === 'profissional');
    expect(prof).toBeTruthy();
    expect(prof.implicito).toBe(1);
  });

  it('não permite dois check-outs da mesma parte', async () => {
    const { profissional, pdcId } = await montarFluxoPago();
    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});

    const primeiro = await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    const segundo = await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});

    expect(primeiro.status).toBe(200);
    expect(segundo.status).toBe(400);
    expect(segundo.body.error).toMatch(/já fez checkout/i);
  });

  it('nota fora da faixa volta 400 (não 500 do CHECK constraint do banco)', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();
    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});

    // "999" como string: a validação comparava o TAMANHO da string com o
    // máximo, então passava e quebrava no CHECK do banco (500).
    const r = await req
      .post(`/api/protocolos/${pdcId}/checkout`)
      .set(auth(contratante.token))
      .send({ nota: '999' });

    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Validação/i);

    // O check-out do contratante NÃO pode ter sido gravado.
    const checkouts = await req.get(`/api/protocolos/${pdcId}/checkouts`).set(auth(profissional.token));
    expect(checkouts.body.checkouts.filter(c => c.tipo_user === 'contratante')).toHaveLength(0);
  });
});

describe('Protocolos — reputação (ponte com o matching)', () => {
  it('a nota do checkout é gravada em avaliacoes', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req
      .post(`/api/protocolos/${pdcId}/checkout`)
      .set(auth(contratante.token))
      .send({ nota: 4, comentario: 'Muito bom.' });

    const av = await db.get(
      'SELECT * FROM avaliacoes WHERE id_contratante = ? AND id_profissional = ?',
      [contratante.id, profissional.id]
    );
    expect(av).toBeTruthy();
    expect(av.nota).toBe(4);
    expect(av.comentario).toBe('Muito bom.');
  });

  it('a nota do checkout aparece no matching como reputação do profissional', async () => {
    const { contratante, profissional, vaga, pdcId } = await montarFluxoPago();

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req
      .post(`/api/protocolos/${pdcId}/checkout`)
      .set(auth(contratante.token))
      .send({ nota: 5, comentario: 'Excelente.' });

    // O perfil público do profissional passa a mostrar a avaliação
    const perfil = await req.get(`/api/profissionais/${profissional.id}`);
    expect(perfil.status).toBe(200);
    expect(perfil.body.stats.total).toBe(1);
    expect(perfil.body.stats.media).toBe(5);
  });
});

describe('Protocolos — garantias de custódia', () => {
  it('protocolo pago não expira (a custódia nunca é destruída por prazo)', async () => {
    const { contratante, pdcId } = await montarFluxoPago();

    // Envelhece o protocolo: pago há muito tempo, com prazo vencido.
    await db.run(
      `UPDATE protocolos SET expira_em = datetime('now', '-10 days') WHERE id = ?`,
      [pdcId]
    );

    const { expirarProtocolosNaoRespondidos } = await import('../src/services/protocolos-cleanup.js');
    const r = await expirarProtocolosNaoRespondidos();

    expect(r.expirados).toBe(0);
    const protocolo = await lerProtocolo(pdcId, contratante.token);
    expect(protocolo.status).toBe('checkout_pendente');
  });

  it('protocolo não pago ainda expira no prazo', async () => {
    const contratante = await createUser({ tipo_usuario: 'contratante' });
    const profissional = await createUser({ tipo_usuario: 'profissional' });
    const vaga = await createVaga(contratante.id, { remuneracao_valor: 100 });

    await req.post('/api/candidaturas').set(auth(profissional.token)).send({ id_vaga: vaga.id });
    const cand = await db.get(
      `SELECT id FROM candidaturas WHERE id_vaga = ? AND id_profissional = ?`,
      [vaga.id, profissional.id]
    );
    await req.patch(`/api/candidaturas/${cand.id}`).set(auth(contratante.token)).send({ status_candidatura: 'aceita' });

    const lista = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
    const pcm = lista.body.protocolos.find(p => p.status === 'enviado');

    await db.run(
      `UPDATE protocolos SET expira_em = datetime('now', '-10 days') WHERE id = ?`,
      [pcm.id]
    );

    const { expirarProtocolosNaoRespondidos } = await import('../src/services/protocolos-cleanup.js');
    const r = await expirarProtocolosNaoRespondidos();
    expect(r.expirados).toBeGreaterThan(0);

    const protocolo = await lerProtocolo(pcm.id, profissional.token);
    expect(protocolo.status).toBe('expirado');
  });

  it('liberação é idempotente: não libera duas vezes nem transfere em duplicidade', async () => {
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

    const protocolo = await lerProtocolo(pdcId, contratante.token);
    expect(protocolo.status).toBe('liberado');
  });

  it('liberação marca o pagamento em custódia como liberado ao profissional', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({ nota: 5 });

    const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
    await req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token));

    const pag = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [pdcId]);
    expect(pag.status).toBe('liberado_profissional');
    expect(pag.liberado_em).toBeTruthy();
  });
});

describe('Protocolos — caminho único de pagamento', () => {
  it('liberação transfere o dinheiro quando o pagamento foi pelo Stripe', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    // Simula um pagamento coletado pelo Stripe (o prefixo `pi_` identifica a
    // trilha). O caminho do Mercado Pago é só bookkeeping; o do Stripe
    // exige Transfer para a conta Connect do profissional.
    await db.run(
      `UPDATE pagamentos_custodia SET stripe_payment_intent_id = 'pi_test_e2e' WHERE id_protocolo = ?`,
      [pdcId]
    );

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({ nota: 5 });

    const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
    const lib = await req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token));
    expect(lib.status).toBe(200);
    expect(lib.body.rail).toBe('stripe');
    expect(lib.body.transfer_id).toBeTruthy();

    // O id da transferência fica gravado na custódia (auditoria do repasse)
    const pag = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [pdcId]);
    expect(pag.stripe_transfer_id).toBe(lib.body.transfer_id);

    // O profissional tem conta Connect criada para receber
    const conn = await db.get('SELECT * FROM stripe_connect WHERE id_user = ?', [profissional.id]);
    expect(conn).toBeTruthy();
  });

  it('liberação com pagamento do Mercado Pago é bookkeeping (sem Transfer do Stripe)', async () => {
    const { contratante, profissional, pdcId } = await montarFluxoPago();

    await db.run(
      `UPDATE pagamentos_custodia SET stripe_payment_intent_id = '1234567890' WHERE id_protocolo = ?`,
      [pdcId]
    );

    await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
    await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({ nota: 5 });

    const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
    const lib = await req.post(`/api/protocolos/${pdcId}/liberar`).set(auth(admin.token));
    expect(lib.status).toBe(200);
    expect(lib.body.rail).toBe('mercadopago');
    expect(lib.body.transfer_id).toBeFalsy();

    const pag = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [pdcId]);
    expect(pag.status).toBe('liberado_profissional');
  });

  it('POST /api/pagamentos delega ao protocolo em vez de criar um pagamento avulso', async () => {
    const contratante = await createUser({ tipo_usuario: 'contratante' });
    const profissional = await createUser({ tipo_usuario: 'profissional' });
    const vaga = await createVaga(contratante.id, { remuneracao_valor: 180 });

    await req.post('/api/candidaturas').set(auth(profissional.token)).send({ id_vaga: vaga.id });
    const cand = await db.get(
      `SELECT id FROM candidaturas WHERE id_vaga = ? AND id_profissional = ?`,
      [vaga.id, profissional.id]
    );
    await req.patch(`/api/candidaturas/${cand.id}`).set(auth(contratante.token)).send({ status_candidatura: 'aceita' });

    const lista = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
    const pcm = lista.body.protocolos.find(p => p.status === 'enviado');
    const pdcId = (await req.post(`/api/protocolos/${pcm.id}/aceitar`).set(auth(profissional.token))).body.pdc.id;

    // Pagar pelo endpoint legado precisa cair no protocolo (via: 'protocolo')
    const r = await req.post('/api/pagamentos').set(auth(contratante.token)).send({ id_vaga: vaga.id, metodo: 'pix' });
    expect(r.status).toBe(201);
    expect(r.body.via).toBe('protocolo');
    expect(r.body.protocolo_id).toBe(pdcId);

    // Nenhum pagamento avulso deve ter sido criado na tabela `pagamentos`
    const avulsos = await db.get('SELECT COUNT(*) AS n FROM pagamentos');
    expect(avulsos.n).toBe(0);

    // E o protocolo tem de estar em custódia
    const protocolo = await lerProtocolo(pdcId, contratante.token);
    expect(protocolo.status).toBe('checkout_pendente');
  });

  it('pagar pelo endpoint legado destrava o check-in do profissional', async () => {
    const contratante = await createUser({ tipo_usuario: 'contratante' });
    const profissional = await createUser({ tipo_usuario: 'profissional' });
    const vaga = await createVaga(contratante.id, { remuneracao_valor: 180 });

    await req.post('/api/candidaturas').set(auth(profissional.token)).send({ id_vaga: vaga.id });
    const cand = await db.get(
      `SELECT id FROM candidaturas WHERE id_vaga = ? AND id_profissional = ?`,
      [vaga.id, profissional.id]
    );
    await req.patch(`/api/candidaturas/${cand.id}`).set(auth(contratante.token)).send({ status_candidatura: 'aceita' });
    const lista = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
    const pcm = lista.body.protocolos.find(p => p.status === 'enviado');
    const pdcId = (await req.post(`/api/protocolos/${pcm.id}/aceitar`).set(auth(profissional.token))).body.pdc.id;

    await req.post('/api/pagamentos').set(auth(contratante.token)).send({ id_vaga: vaga.id, metodo: 'pix' });

    // O check-in precisa estar liberado — é o que prova que o dinheiro
    // entrou pela custódia e não por fora.
    const checkin = await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({});
    expect(checkin.status).toBe(200);
  });
});
