/**
 * tests/candidaturas-retirar.test.js
 *
 * O profissional pode retirar a própria candidatura enquanto ela ainda não
 * foi decidida (pendente/visualizada → cancelada). Depois de aceita, a vaga
 * fechou e o protocolo de custódia pode existir — retirar viraria quebra de
 * contrato; depois de recusada, a decisão já foi do contratante.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('POST /api/candidaturas/:id/retirar', () => {
  beforeEach(async () => { await resetDb(); });

  it('profissional retira a própria candidatura pendente', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(p.token));
    expect(r.status).toBe(200);
    expect(r.body.candidatura.status_candidatura).toBe('cancelada');
  });

  it('retira candidatura já visualizada pelo contratante', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    // visualiza (pendente → visualizada)
    await (await api()).get(`/api/candidaturas/vaga/${v.id}`).set(auth(c.token));

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(p.token));
    expect(r.status).toBe(200);
    expect(r.body.candidatura.status_candidatura).toBe('cancelada');
  });

  it('profissional alheio não retira candidatura dos outros (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const outro = await createUser({ tipo_usuario: 'profissional', email: 'alheio@demo.com' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(outro.token));
    expect(r.status).toBe(403);
    // e a candidatura segue pendente
    const check = await (await api()).get(`/api/candidaturas/${criada.body.candidatura.id}/historico-status`).set(auth(p.token));
    expect(check.status).toBe(200);
  });

  it('contratante não usa o endpoint de retirar (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(c.token));
    expect(r.status).toBe(403);
  });

  it('candidatura aceita não pode ser retirada (409)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    await (await api()).patch(`/api/candidaturas/${criada.body.candidatura.id}`).set(auth(c.token)).send({ status_candidatura: 'aceita' });

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(p.token));
    expect(r.status).toBe(409);
  });

  it('candidatura recusada não pode ser retirada (409)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    await (await api()).patch(`/api/candidaturas/${criada.body.candidatura.id}`).set(auth(c.token)).send({ status_candidatura: 'recusada' });

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(p.token));
    expect(r.status).toBe(409);
  });

  it('repetir a retirada numa já cancelada → 409 (idempotente pela porta errada)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(p.token));

    const r = await (await api()).post(`/api/candidaturas/${criada.body.candidatura.id}/retirar`).set(auth(p.token));
    expect(r.status).toBe(409);
  });

  it('retirada fica registrada no histórico de status (auditoria M11)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const id = criada.body.candidatura.id;
    await (await api()).post(`/api/candidaturas/${id}/retirar`).set(auth(p.token));

    const r = await (await api()).get(`/api/candidaturas/${id}/historico-status`).set(auth(p.token));
    expect(r.status).toBe(200);
    const ultima = r.body.historico[r.body.historico.length - 1];
    expect(ultima.status_anterior).toBe('pendente');
    expect(ultima.status_novo).toBe('cancelada');
    expect(ultima.motivo).toBe('retirada pelo profissional');
  });

  it('depois de retirar, o profissional pode se candidatar de novo à vaga', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const criada = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const id = criada.body.candidatura.id;
    await (await api()).post(`/api/candidaturas/${id}/retirar`).set(auth(p.token));

    const r = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({
      id_vaga: v.id, mensagem: 'Voltei — minha agenda liberou.'
    });
    expect(r.status).toBe(201);
    expect(r.body.reativada).toBe(true);
    expect(r.body.candidatura.id).toBe(id);            // mesma linha reativada
    expect(r.body.candidatura.status_candidatura).toBe('pendente');
    expect(r.body.candidatura.mensagem).toBe('Voltei — minha agenda liberou.');

    // A trilha de auditoria preserva o ciclo completo
    const hist = await (await api()).get(`/api/candidaturas/${id}/historico-status`).set(auth(p.token));
    const transicoes = hist.body.historico.map(h => `${h.status_anterior}->${h.status_novo}`);
    expect(transicoes).toContain('pendente->cancelada');
    expect(transicoes).toContain('cancelada->pendente');
  });

  it('retirar candidatura inexistente → 404', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/candidaturas/999999/retirar').set(auth(p.token));
    expect(r.status).toBe(404);
  });
});
