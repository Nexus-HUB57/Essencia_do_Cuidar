import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('POST /api/candidaturas', () => {
  beforeEach(async () => { await resetDb(); });

  it('profissional se candidata a uma vaga ativa', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const r = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({
      id_vaga: v.id, mensagem: 'Tenho experiência com medicação.'
    });
    expect(r.status).toBe(201);
    expect(r.body.candidatura.status_candidatura).toBe('pendente');
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).post('/api/candidaturas').send({ id_vaga: 1 });
    expect(r.status).toBe(401);
  });

  it('contratante não pode se candidatar (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/candidaturas').set(auth(c.token)).send({ id_vaga: 1 });
    expect(r.status).toBe(403);
  });

  it('devolve 404 para vaga inexistente', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: 999999 });
    expect(r.status).toBe(404);
  });

  it('devolve 404 para vaga pausada', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    await (await api()).patch(`/api/vagas/${v.id}/status`).set(auth(c.token)).send({ status: 'pausada' });
    const r = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    expect(r.status).toBe(404);
  });

  it('devolve 409 para candidatura duplicada', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const r = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    expect(r.status).toBe(409);
  });
});

describe('GET /api/candidaturas/vaga/:id', () => {
  beforeEach(async () => { await resetDb(); });

  it('contratante dono da vaga vê os candidatos', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id, mensagem: 'oi' });
    const r = await (await api()).get(`/api/candidaturas/vaga/${v.id}`).set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.candidatos.length).toBe(1);
  });

  it('marca pendentes como visualizadas', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    await (await api()).get(`/api/candidaturas/vaga/${v.id}`).set(auth(c.token));
    const r = await (await api()).get('/api/candidaturas/profissional/minhas').set(auth(p.token));
    expect(r.body.candidaturas[0].status_candidatura).toBe('visualizada');
  });

  it('outro contratante recebe 403', async () => {
    const c1 = await createUser({ tipo_usuario: 'contratante' });
    const c2 = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c1.id);
    const r = await (await api()).get(`/api/candidaturas/vaga/${v.id}`).set(auth(c2.token));
    expect(r.status).toBe(403);
  });
});

describe('PATCH /api/candidaturas/:id', () => {
  beforeEach(async () => { await resetDb(); });

  it('contratante aceita a candidatura', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const cad = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const r = await (await api()).patch(`/api/candidaturas/${cad.body.candidatura.id}`)
      .set(auth(c.token)).send({ status_candidatura: 'aceita' });
    expect(r.status).toBe(200);
    expect(r.body.candidatura.status_candidatura).toBe('aceita');
  });

  it('profissional não pode aceitar a própria candidatura (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const cad = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const r = await (await api()).patch(`/api/candidaturas/${cad.body.candidatura.id}`)
      .set(auth(p.token)).send({ status_candidatura: 'aceita' });
    expect(r.status).toBe(403);
  });

  it('rejeita status de candidatura inválido', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const cad = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const r = await (await api()).patch(`/api/candidaturas/${cad.body.candidatura.id}`)
      .set(auth(c.token)).send({ status_candidatura: 'talvez' });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/candidaturas/profissional/minhas', () => {
  beforeEach(async () => { await resetDb(); });

  it('lista as candidaturas do profissional logado', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    const r = await (await api()).get('/api/candidaturas/profissional/minhas').set(auth(p.token));
    expect(r.status).toBe(200);
    expect(r.body.candidaturas.length).toBe(1);
  });
});
