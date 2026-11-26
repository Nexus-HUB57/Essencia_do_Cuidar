import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('POST /api/mensagens', () => {
  beforeEach(async () => { await resetDb(); });

  it('envia mensagem entre dois usuários', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/mensagens').set(auth(c.token)).send({
      id_destinatario: p.id, conteudo: 'Olá, tenho interesse na vaga.'
    });
    expect(r.status).toBe(201);
    expect(r.body.mensagem.conteudo).toBe('Olá, tenho interesse na vaga.');
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).post('/api/mensagens').send({ id_destinatario: 1, conteudo: 'oi' });
    expect(r.status).toBe(401);
  });

  it('não permite enviar para si mesmo', async () => {
    const c = await createUser();
    const r = await (await api()).post('/api/mensagens').set(auth(c.token)).send({
      id_destinatario: c.id, conteudo: 'loop'
    });
    expect(r.status).toBe(400);
  });

  it('rejeita mensagem vazia', async () => {
    const c = await createUser();
    const p = await createUser();
    const r = await (await api()).post('/api/mensagens').set(auth(c.token)).send({
      id_destinatario: p.id, conteudo: ''
    });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/mensagens', () => {
  beforeEach(async () => { await resetDb(); });

  it('lista conversas do usuário logado', async () => {
    const c = await createUser();
    const p = await createUser();
    await (await api()).post('/api/mensagens').set(auth(c.token)).send({
      id_destinatario: p.id, conteudo: 'oi'
    });
    const r = await (await api()).get('/api/mensagens').set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.conversas.length).toBe(1);
  });
});

describe('GET /api/mensagens/:outroId', () => {
  beforeEach(async () => { await resetDb(); });

  it('devolve o histórico bilateral', async () => {
    const c = await createUser();
    const p = await createUser();
    await (await api()).post('/api/mensagens').set(auth(c.token)).send({ id_destinatario: p.id, conteudo: 'oi' });
    await (await api()).post('/api/mensagens').set(auth(p.token)).send({ id_destinatario: c.id, conteudo: 'olá' });
    const r = await (await api()).get(`/api/mensagens/${p.id}`).set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.mensagens.length).toBe(2);
  });

  it('marca as mensagens recebidas como lidas', async () => {
    const c = await createUser();
    const p = await createUser();
    await (await api()).post('/api/mensagens').set(auth(c.token)).send({ id_destinatario: p.id, conteudo: 'oi' });
    await (await api()).get(`/api/mensagens/${c.id}`).set(auth(p.token));
    const r = await (await api()).get(`/api/mensagens/${c.id}`).set(auth(p.token));
    expect(r.body.mensagens[0].lida).toBe(1);
  });
});

describe('perfis públicos', () => {
  beforeEach(async () => { await resetDb(); });

  it('GET /api/profissionais/:id devolve perfil sem dados sensíveis', async () => {
    const p = await createUser({ tipo_usuario: 'profissional', nome: 'Ana Teste' });
    const r = await (await api()).get(`/api/profissionais/${p.id}`);
    expect(r.status).toBe(200);
    expect(r.body.user.nome).toBe('Ana Teste');
    expect(r.body.user.senha_hash).toBeUndefined();
  });

  it('devolve 404 para id inexistente', async () => {
    const r = await (await api()).get('/api/profissionais/999999');
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/profissionais/me', () => {
  beforeEach(async () => { await resetDb(); });

  it('profissional atualiza o próprio perfil', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).put('/api/profissionais/me').set(auth(p.token)).send({
      bio: 'Enfermeira com 10 anos de experiência',
      especialidades: ['Enfermagem', 'Curativos'],
      disponibilidade: ['manha']
    });
    expect(r.status).toBe(200);
    expect(r.body.detalhes.especialidades).toEqual(['Enfermagem', 'Curativos']);
  });

  it('contratante não pode atualizar perfil de profissional (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).put('/api/profissionais/me').set(auth(c.token)).send({ bio: 'x' });
    expect(r.status).toBe(403);
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).put('/api/profissionais/me').send({ bio: 'x' });
    expect(r.status).toBe(401);
  });
});

describe('POST /api/profissionais/me/diploma', () => {
  beforeEach(async () => { await resetDb(); });

  it('rejeita upload sem arquivo (400)', async () => {
    const p = await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).post('/api/profissionais/me/diploma').set(auth(p.token));
    expect(r.status).toBe(400);
  });
});
