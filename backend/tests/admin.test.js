import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('GET /api/admin/stats', () => {
  beforeEach(async () => { await resetDb(); });

  it('admin recebe as métricas', async () => {
    const a = await createUser({ is_admin: 1 });
    const c = await createUser({ tipo_usuario: 'contratante' });
    await createVaga(c.id);
    const r = await (await api()).get('/api/admin/stats').set(auth(a.token));
    expect(r.status).toBe(200);
    expect(r.body.users).toBeGreaterThanOrEqual(2);
    expect(r.body.vagas_ativas).toBe(1);
  });

  it('usuário comum recebe 403', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).get('/api/admin/stats').set(auth(c.token));
    expect(r.status).toBe(403);
  });

  it('sem token recebe 401', async () => {
    const r = await (await api()).get('/api/admin/stats');
    expect(r.status).toBe(401);
  });
});

describe('GET /api/admin/users', () => {
  beforeEach(async () => { await resetDb(); });

  it('lista usuários sem expor senha_hash', async () => {
    const a = await createUser({ is_admin: 1 });
    await createUser({ nome: 'Buscavel' });
    const r = await (await api()).get('/api/admin/users').set(auth(a.token));
    expect(r.status).toBe(200);
    expect(r.body.users.length).toBeGreaterThan(0);
    for (const u of r.body.users) expect(u.senha_hash).toBeUndefined();
  });

  it('filtra por tipo', async () => {
    const a = await createUser({ is_admin: 1 });
    await createUser({ tipo_usuario: 'profissional' });
    const r = await (await api()).get('/api/admin/users?tipo=profissional').set(auth(a.token));
    expect(r.status).toBe(200);
    expect(r.body.users.every((u) => u.tipo_usuario === 'profissional')).toBe(true);
  });
});

describe('PATCH /api/admin/users/:id', () => {
  beforeEach(async () => { await resetDb(); });

  it('admin suspende um usuário', async () => {
    const a = await createUser({ is_admin: 1 });
    const u = await createUser();
    const r = await (await api()).patch(`/api/admin/users/${u.id}`).set(auth(a.token)).send({
      suspended: true, motivo: 'Teste'
    });
    expect(r.status).toBe(200);
    const login = await (await api()).post('/api/auth/login').send({ email: u.email, senha: u.senha });
    expect(login.status).toBe(403);
  });

  it('usuário comum não suspende ninguém (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const u = await createUser();
    const r = await (await api()).patch(`/api/admin/users/${u.id}`).set(auth(c.token)).send({ suspended: true });
    expect(r.status).toBe(403);
  });
});

describe('moderação de vagas (admin)', () => {
  beforeEach(async () => { await resetDb(); });

  it('admin fecha uma vaga', async () => {
    const a = await createUser({ is_admin: 1 });
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).patch(`/api/admin/vagas/${v.id}`).set(auth(a.token)).send({ status: 'fechada' });
    expect(r.status).toBe(200);
    const list = await (await api()).get('/api/vagas');
    expect(list.body.vagas.find((x) => x.id === v.id)).toBeUndefined();
  });

  it('admin remove uma vaga', async () => {
    const a = await createUser({ is_admin: 1 });
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).delete(`/api/admin/vagas/${v.id}`).set(auth(a.token));
    expect(r.status).toBe(200);
    const list = await (await api()).get('/api/vagas');
    expect(list.body.vagas.find((x) => x.id === v.id)).toBeUndefined();
  });

  it('contratante não modera (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).patch(`/api/admin/vagas/${v.id}`).set(auth(c.token)).send({ status: 'fechada' });
    expect(r.status).toBe(403);
  });
});

describe('GET /api/admin/verificacoes', () => {
  beforeEach(async () => { await resetDb(); });

  it('admin lista verificações pendentes', async () => {
    const a = await createUser({ is_admin: 1 });
    const p = await createUser({ tipo_usuario: 'profissional' });
    await (await api()).put('/api/profissionais/me').set(auth(p.token)).send({
      registro_conselho: '123456/SP', tipo_registro: 'CRM'
    });
    const r = await (await api()).get('/api/admin/verificacoes').set(auth(a.token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.verificacoes)).toBe(true);
  });

  it('usuário comum não lista verificações (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).get('/api/admin/verificacoes').set(auth(c.token));
    expect(r.status).toBe(403);
  });
});
