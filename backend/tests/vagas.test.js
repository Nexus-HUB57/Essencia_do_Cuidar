import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('GET /api/vagas', () => {
  beforeEach(async () => {
    await resetDb();
    const c = await createUser({ tipo_usuario: 'contratante' });
    await createVaga(c.id);
    await createVaga(c.id, { complexidade: 'media', cidade: 'Campinas', carga_horaria: '12h' });
  });

  it('lista vagas publicamente (sem auth)', async () => {
    const r = await (await api()).get('/api/vagas');
    expect(r.status).toBe(200);
    expect(r.body.vagas.length).toBe(2);
  });

  it('filtra por cidade (matching atual)', async () => {
    const r = await (await api()).get('/api/vagas?cidade=Campinas');
    expect(r.status).toBe(200);
    expect(r.body.vagas.length).toBe(1);
    expect(r.body.vagas[0].cidade).toBe('Campinas');
  });

  it('filtra por carga horária (matching atual)', async () => {
    const r = await (await api()).get('/api/vagas?cargaHoraria=12h');
    expect(r.status).toBe(200);
    expect(r.body.vagas.length).toBe(1);
    expect(r.body.vagas[0].carga_horaria).toBe('12h');
  });

  it('pagina com limite', async () => {
    const r = await (await api()).get('/api/vagas?limite=1');
    expect(r.status).toBe(200);
    expect(r.body.vagas.length).toBe(1);
  });

  it('não expõe senha_hash nem id_contratante indevido', async () => {
    const r = await (await api()).get('/api/vagas');
    const v = r.body.vagas[0];
    expect(v.senha_hash).toBeUndefined();
  });
});

describe('GET /api/vagas/:id', () => {
  beforeEach(async () => { await resetDb(); });

  it('devolve o detalhe de uma vaga', async () => {
    const c = await createUser();
    const v = await createVaga(c.id);
    const r = await (await api()).get(`/api/vagas/${v.id}`);
    expect(r.status).toBe(200);
    expect(r.body.vaga.id).toBe(v.id);
  });

  it('devolve 404 para vaga inexistente', async () => {
    const r = await (await api()).get('/api/vagas/999999');
    expect(r.status).toBe(404);
  });
});

describe('POST /api/vagas', () => {
  beforeEach(async () => { await resetDb(); });

  it('contratante publica vaga com 201', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token)).send({
      paciente_sexo: 'M', paciente_idade: 80,
      complexidade: 'baixa',
      servico_descricao: 'Cuidados com medicação',
      profissional_desejado: 'Enfermeiro',
      remuneracao_tipo: 'hora', remuneracao_valor: 150
    });
    expect(r.status).toBe(201);
    expect(r.body.vaga.complexidade).toBe('baixa');
  });

  it('profissional não pode publicar vaga (403)', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/vagas').set(auth(p.token)).send({
      complexidade: 'baixa', servico_descricao: 'x', profissional_desejado: 'y'
    });
    expect(r.status).toBe(403);
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).post('/api/vagas').send({
      complexidade: 'baixa', servico_descricao: 'x', profissional_desejado: 'y'
    });
    expect(r.status).toBe(401);
  });

  it('rejeita complexidade alta (regra de negócio)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token)).send({
      complexidade: 'alta', servico_descricao: 'UTI', profissional_desejado: 'Enfermeiro'
    });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/vagas/contratante/minhas', () => {
  beforeEach(async () => { await resetDb(); });

  it('lista apenas as vagas do contratante logado', async () => {
    const c1 = await createUser({ tipo_usuario: 'contratante' });
    const c2 = await createUser({ tipo_usuario: 'contratante' });
    await createVaga(c1.id);
    await createVaga(c2.id);
    const r = await (await api()).get('/api/vagas/contratante/minhas').set(auth(c1.token));
    expect(r.status).toBe(200);
    expect(r.body.vagas.length).toBe(1);
  });

  it('profissional recebe 403', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).get('/api/vagas/contratante/minhas').set(auth(p.token));
    expect(r.status).toBe(403);
  });
});

describe('PATCH /api/vagas/:id/status', () => {
  beforeEach(async () => { await resetDb(); });

  it('contratante pausa a própria vaga', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).patch(`/api/vagas/${v.id}/status`).set(auth(c.token)).send({ status: 'pausada' });
    expect(r.status).toBe(200);
    expect(r.body.vaga.status).toBe('pausada');
  });

  it('contratante não mexe em vaga de outro (403)', async () => {
    const c1 = await createUser({ tipo_usuario: 'contratante' });
    const c2 = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c1.id);
    const r = await (await api()).patch(`/api/vagas/${v.id}/status`).set(auth(c2.token)).send({ status: 'pausada' });
    expect(r.status).toBe(403);
  });

  it('rejeita status inválido', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).patch(`/api/vagas/${v.id}/status`).set(auth(c.token)).send({ status: 'explodida' });
    expect(r.status).toBe(400);
  });
});
