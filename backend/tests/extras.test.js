import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createVaga, auth } from './helpers.js';

describe('GET /api/i18n', () => {
  beforeEach(async () => { await resetDb(); });

  it('lista os locales suportados', async () => {
    const r = await (await api()).get('/api/i18n');
    expect(r.status).toBe(200);
    expect(r.body.supported).toContain('pt-BR');
    expect(r.body.supported).toContain('es');
    expect(r.body.supported).toContain('en');
    expect(r.body.default).toBe('pt-BR');
  });

  it('devolve o dicionário do locale pedido', async () => {
    const r = await (await api()).get('/api/i18n/en');
    expect(r.status).toBe(200);
    expect(r.body.locale).toBe('en');
    expect(r.body.strings).toBeTruthy();
  });

  it('devolve 404 para locale não suportado', async () => {
    const r = await (await api()).get('/api/i18n/fr');
    expect(r.status).toBe(404);
  });
});

describe('favoritos', () => {
  beforeEach(async () => { await resetDb(); });

  it('favorita uma vaga (toggle on)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    const r = await (await api()).post('/api/favoritos').set(auth(c.token)).send({ tipo: 'vaga', id_recurso: v.id });
    expect(r.status).toBe(201);
    expect(r.body.favoritado).toBe(true);
  });

  it('desfavorita no segundo clique (toggle off)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    await (await api()).post('/api/favoritos').set(auth(c.token)).send({ tipo: 'vaga', id_recurso: v.id });
    const r = await (await api()).post('/api/favoritos').set(auth(c.token)).send({ tipo: 'vaga', id_recurso: v.id });
    expect(r.body.favoritado).toBe(false);
  });

  it('rejeita tipo inválido (400)', async () => {
    const c = await createUser();
    const r = await (await api()).post('/api/favoritos').set(auth(c.token)).send({ tipo: 'banana', id_recurso: 1 });
    expect(r.status).toBe(400);
  });

  it('devolve 404 para vaga inexistente', async () => {
    const c = await createUser();
    const r = await (await api()).post('/api/favoritos').set(auth(c.token)).send({ tipo: 'vaga', id_recurso: 99999 });
    expect(r.status).toBe(404);
  });

  it('lista os favoritos do usuário', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const v = await createVaga(c.id);
    await (await api()).post('/api/favoritos').set(auth(c.token)).send({ tipo: 'vaga', id_recurso: v.id });
    const r = await (await api()).get('/api/favoritos?tipo=vaga').set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.favoritos.length).toBe(1);
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).get('/api/favoritos');
    expect(r.status).toBe(401);
  });
});

describe('avaliações', () => {
  beforeEach(async () => { await resetDb(); });

  async function cenarioAceita() {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const cad = await (await api()).post('/api/candidaturas').set(auth(p.token)).send({ id_vaga: v.id });
    await (await api()).patch(`/api/candidaturas/${cad.body.candidatura.id}`)
      .set(auth(c.token)).send({ status_candidatura: 'aceita' });
    return { c, p, v };
  }

  it('contratante avalia profissional com candidatura aceita', async () => {
    const { c, p, v } = await cenarioAceita();
    const r = await (await api()).post('/api/avaliacoes').set(auth(c.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 5, comentario: 'Excelente'
    });
    expect(r.status).toBe(201);
    expect(r.body.avaliacao.nota).toBe(5);
  });

  it('rejeita nota fora do range 1-5', async () => {
    const { c, p, v } = await cenarioAceita();
    const r = await (await api()).post('/api/avaliacoes').set(auth(c.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 9
    });
    expect(r.status).toBe(400);
  });

  it('rejeita avaliação sem candidatura aceita (403)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const p = await createUser({ tipo_usuario: 'profissional' });
    const v = await createVaga(c.id);
    const r = await (await api()).post('/api/avaliacoes').set(auth(c.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 5
    });
    expect(r.status).toBe(403);
  });

  it('não permite avaliar vaga de outro contratante (404)', async () => {
    const { p, v } = await cenarioAceita();
    const outro = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/avaliacoes').set(auth(outro.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 5
    });
    expect(r.status).toBe(404);
  });

  it('atualiza a avaliação em vez de duplicar', async () => {
    const { c, p, v } = await cenarioAceita();
    await (await api()).post('/api/avaliacoes').set(auth(c.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 3
    });
    const r = await (await api()).post('/api/avaliacoes').set(auth(c.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 5
    });
    expect(r.status).toBe(200);
    expect(r.body.avaliacao.nota).toBe(5);
  });

  it('stats públicos do profissional refletem a avaliação', async () => {
    const { c, p, v } = await cenarioAceita();
    await (await api()).post('/api/avaliacoes').set(auth(c.token)).send({
      id_profissional: p.id, id_vaga: v.id, nota: 4
    });
    const r = await (await api()).get(`/api/avaliacoes/profissional/${p.id}`);
    expect(r.status).toBe(200);
    expect(r.body.stats.media).toBe(4);
    expect(r.body.stats.total).toBe(1);
  });
});

describe('notificações', () => {
  beforeEach(async () => { await resetDb(); });

  it('contador começa em zero', async () => {
    const u = await createUser();
    const r = await (await api()).get('/api/notificacoes/contador').set(auth(u.token));
    expect(r.status).toBe(200);
    expect(r.body.nao_lidas).toBe(0);
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).get('/api/notificacoes/contador');
    expect(r.status).toBe(401);
  });

  it('lista notificações do usuário', async () => {
    const u = await createUser();
    const r = await (await api()).get('/api/notificacoes').set(auth(u.token));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(r.body.nao_lidas).toBe(0);
  });
});
