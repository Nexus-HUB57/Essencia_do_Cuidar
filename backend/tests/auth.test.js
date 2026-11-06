import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, auth } from './helpers.js';

describe('POST /api/auth/cadastro', () => {
  beforeEach(async () => { await resetDb(); });

  it('cadastra contratante e devolve JWT', async () => {
    const r = await (await api()).post('/api/auth/cadastro').send({
      tipo_usuario: 'contratante', nome: 'Maria Teste',
      email: 'maria@teste.com', senha: 'demo1234', telefone: '11988880000'
    });
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.email).toBe('maria@teste.com');
    expect(r.body.user).not.toHaveProperty('senha_hash');
  });

  it('cadastra profissional e cria registro em profissionais_detalhes', async () => {
    const r = await (await api()).post('/api/auth/cadastro').send({
      tipo_usuario: 'profissional', nome: 'Ana Teste', email: 'ana@teste.com', senha: 'demo1234'
    });
    expect(r.status).toBe(201);
    const me = await (await api()).get('/api/auth/me').set(auth(r.body.token));
    expect(me.status).toBe(200);
    expect(me.body.detalhes).toBeTruthy();
    expect(me.body.detalhes.id_user).toBe(r.body.user.id);
  });

  it('rejeita e-mail duplicado com 409', async () => {
    const body = { tipo_usuario: 'contratante', nome: 'Ana Silva', email: 'dup@teste.com', senha: 'demo1234' };
    await (await api()).post('/api/auth/cadastro').send(body);
    const r = await (await api()).post('/api/auth/cadastro').send(body);
    expect(r.status).toBe(409);
  });

  it('rejeita senha com menos de 6 caracteres', async () => {
    const r = await (await api()).post('/api/auth/cadastro').send({
      tipo_usuario: 'contratante', nome: 'Ana Silva', email: 'a@teste.com', senha: '123'
    });
    expect(r.status).toBe(400);
  });

  it('rejeita tipo_usuario inválido', async () => {
    const r = await (await api()).post('/api/auth/cadastro').send({
      tipo_usuario: 'admin', nome: 'Ana Silva', email: 'a@teste.com', senha: 'demo1234'
    });
    expect(r.status).toBe(400);
  });

  it('normaliza e-mail para minúsculas', async () => {
    const r = await (await api()).post('/api/auth/cadastro').send({
      tipo_usuario: 'contratante', nome: 'Ana Silva', email: 'MIXED@Teste.com', senha: 'demo1234'
    });
    expect(r.body.user.email).toBe('mixed@teste.com');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => { await resetDb(); });

  it('faz login com credenciais corretas', async () => {
    const u = await createUser({ email: 'login@teste.com', senha: 'demo1234' });
    const r = await (await api()).post('/api/auth/login').send({ email: u.email, senha: u.senha });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
  });

  it('rejeita senha errada com 401', async () => {
    const u = await createUser({ email: 'wrong@teste.com' });
    const r = await (await api()).post('/api/auth/login').send({ email: u.email, senha: 'errada123' });
    expect(r.status).toBe(401);
  });

  it('rejeita e-mail inexistente com 401', async () => {
    const r = await (await api()).post('/api/auth/login').send({ email: 'nao@existe.com', senha: 'demo1234' });
    expect(r.status).toBe(401);
  });

  it('bloqueia login de conta suspensa com 403', async () => {
    const u = await createUser({ email: 'susp@teste.com' });
    const db = (await import('../src/db/driver.js')).default;
    await db.run('UPDATE users SET suspended_at = datetime(\'now\'), suspended_reason = ? WHERE id = ?', ['teste', u.id]);
    const r = await (await api()).post('/api/auth/login').send({ email: u.email, senha: u.senha });
    expect(r.status).toBe(403);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(async () => { await resetDb(); });

  it('devolve o usuário logado', async () => {
    const u = await createUser({ nome: 'Fulano' });
    const r = await (await api()).get('/api/auth/me').set(auth(u.token));
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(u.id);
  });

  it('exige token (401 sem header)', async () => {
    const r = await (await api()).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('exige token válido (401 com token inválido)', async () => {
    const r = await (await api()).get('/api/auth/me').set(auth('token.invalido'));
    expect(r.status).toBe(401);
  });
});

describe('GET /api/health', () => {
  it('responde 200 com driver e reachability do banco', async () => {
    const r = await (await api()).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.db.driver).toBe('sqlite');
    expect(r.body.db.reachable).toBe(true);
  });
});
