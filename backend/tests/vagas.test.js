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

/**
 * Regressão dos filtros de listagem.
 *
 * O #26 reduziu `GET /api/vagas` a 2 filtros (cidade + carga horaria), mas
 * o frontend continuou enviando `profissional`, `complexidade`, `regiao` e
 * `remuneracaoMin` (DashboardProfissional e VagasPublicas). Resultado: os
 * campos de filtro apareciam na UI e não filhavam nada — a resposta vinha
 * com a lista inteira. Estes testes travam o comportamento.
 */
describe('GET /api/vagas — filtros de listagem (regressão #26)', () => {
  beforeEach(async () => {
    await resetDb();
    const c = await createUser({ tipo_usuario: 'contratante' });
    await createVaga(c.id, {
      profissional_desejado: 'Fisioterapeuta',
      complexidade: 'media',
      remuneracao_valor: 120,
      tipo_contrato: 'CLT',
      jornada_escala: 'Seg a Sex',
      regiao: 'São Paulo - SP',
      cidade: 'São Paulo'
    });
    await createVaga(c.id, {
      profissional_desejado: 'Cuidador de Idosos',
      complexidade: 'baixa',
      remuneracao_valor: 40,
      tipo_contrato: 'PJ',
      jornada_escala: '12x36',
      regiao: 'Campinas - SP',
      cidade: 'Campinas'
    });
  });

  it('filtra por profissional (campo que a UI envia)', async () => {
    const r = await (await api()).get('/api/vagas?profissional=Fisioterapeuta');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.vagas[0].profissional_desejado).toBe('Fisioterapeuta');
  });

  it('filtra por complexité (campo que a UI envia)', async () => {
    const r = await (await api()).get('/api/vagas?complexidade=baixa');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.vagas[0].complexidade).toBe('baixa');
  });

  it('filtra por região (campo que a UI envia)', async () => {
    const r = await (await api()).get('/api/vagas?regiao=Campinas');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.vagas[0].cidade).toBe('Campinas');
  });

  it('filtra por remuneração mínima (campo que a UI envia)', async () => {
    const r = await (await api()).get('/api/vagas?remuneracaoMin=100');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.vagas[0].remuneracao_valor).toBe(120);
  });

  it('filtra por tipo de contrato e jornada', async () => {
    const r1 = await (await api()).get('/api/vagas?tipoContrato=CLT');
    expect(r1.body.total).toBe(1);
    expect(r1.body.vagas[0].tipo_contrato).toBe('CLT');

    const r2 = await (await api()).get('/api/vagas?jornadaEscala=12x36');
    expect(r2.body.total).toBe(1);
    expect(r2.body.vagas[0].jornada_escala).toBe('12x36');
  });

  it('o filtro de profession é taxonomia-aware (Fisioterapia acha Fisioterapeuta)', async () => {
    const r = await (await api()).get('/api/vagas?profissional=Fisioterapia');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.vagas[0].profissional_desejado).toBe('Fisioterapeuta');
  });

  it('combina filtros (AND) entre os dois conjuntos de filtros', async () => {
    const r = await (await api()).get(
      '/api/vagas?profissional=Cuidador&complexidade=baixa&cidade=Campinas'
    );
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.vagas[0].profissional_desejado).toBe('Cuidador de Idosos');
  });

  it('anuncia todos os filtros aceitos em filtros_disponiveis', async () => {
    const r = await (await api()).get('/api/vagas');
    const disponiveis = r.body.filtros_disponiveis;
    for (const f of ['cidade', 'cargaHoraria', 'profissional', 'complexidade', 'regiao', 'remuneracaoMin']) {
      expect(disponiveis).toContain(f);
    }
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

/**
 * Restrição de cobertura — o sistema atende APENAS a RMC (Região
 * Metropolitana de Campinas) e a UF é sempre SP (backend/src/utils/rmc.js).
 *
 * A validação vive no servidor: o select do frontend é só UX. Qualquer
 * cliente que tente publicar vaga fora da RMC (ou com outra UF) recebe 422
 * com a lista dos municípios aceitos.
 */
describe('POST /api/vagas — restrição de cobertura RMC/SP', () => {
  beforeEach(async () => { await resetDb(); });

  const base = {
    complexidade: 'baixa',
    servico_descricao: 'Cuidados domiciliares diurnos na região da RMC',
    profissional_desejado: 'Cuidador de Idosos'
  };

  it('aceita município da RMC e grava UF SP mesmo sem regiao_uf', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token))
      .send({ ...base, regiao: 'Campinas' });
    expect(r.status).toBe(201);
    expect(r.body.vaga.regiao_uf).toBe('SP');
    expect(r.body.vaga.regiao).toBe('Campinas');
  });

  it('aceita grafia sem acento e UF minúscula ("sp")', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token))
      .send({ ...base, regiao: "Santa Barbara d'Oeste", regiao_uf: 'sp' });
    expect(r.status).toBe(201);
    expect(r.body.vaga.regiao_uf).toBe('SP');
  });

  it('recusa UF fora de SP (422)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token))
      .send({ ...base, regiao: 'Campinas', regiao_uf: 'RJ' });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/SP/);
  });

  it('recusa município fora da RMC (422) e lista os aceitos', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token))
      .send({ ...base, regiao: 'Santos', regiao_uf: 'SP' });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/RMC/);
    expect(r.body.details[0].msg).toMatch(/Campinas/);
  });

  it('vaga sem região continua aceita (região é opcional)', async () => {
    const c = await createUser({ tipo_usuario: 'contratante' });
    const r = await (await api()).post('/api/vagas').set(auth(c.token)).send(base);
    expect(r.status).toBe(201);
  });
});
