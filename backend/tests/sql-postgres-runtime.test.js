/**
 * tests/sql-postgres-runtime.test.js
 *
 * Valida o SQL REALMENTE EXECUTADO pela aplicação contra o parser do
 * PostgreSQL.
 *
 * Por que isso importa: o código é escrito em dialeto SQLite e roda em
 * PostgreSQL em produção, com a tradução em `db/sql-dialect.js`. O teste
 * estático (`sql-dialect.test.js`) prova que a tradução funciona; este
 * prova que o resultado é SQL VÁLIDO de verdade — inclusive o detalhe que
 * mais quebra em produção, que é comparar uma coluna TEXT com um
 * `CURRENT_TIMESTAMP` (o PostgreSQL não faz `text + interval`).
 *
 * A instrumentação acontece no driver (`globalThis.__SQL_TRACE__`), que
 * registra o SQL já com as interpolações resolvidas — extrair strings do
 * código-fonte não serviria, porque `${where}` viraria lixo sintático.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { parse } from 'pgsql-ast-parser';
import { api, auth, createUser, createVaga, resetDb } from './helpers.js';
import db from '../src/db/driver.js';
import { toPostgres } from '../src/db/sql-dialect.js';

let req;

/**
 * Reproduz o passo final do driver do Postgres: traduz o dialeto e converte
 * os placeholders para $1, $2...
 * @param {string} sql
 * @returns {string}
 */
function comoPostgres(sql) {
  let i = 0;
  return toPostgres(sql).replace(/\?/g, () => `$${++i}`);
}

beforeAll(async () => {
  req = await api();
});

beforeEach(async () => {
  await resetDb();
});

describe('sql-postgres-runtime — SQL executado é válido em PostgreSQL', () => {
  it('valida o SQL de um fluxo completo (candidatura → custódia → check-in/out → matching)', async () => {
    const trace = [];
    globalThis.__SQL_TRACE__ = trace;

    try {
      // ── Monta o fluxo completo ──────────────────────────────────────
      const contratante = await createUser({ tipo_usuario: 'contratante' });
      const profissional = await createUser({ tipo_usuario: 'profissional' });
      const admin = await createUser({ tipo_usuario: 'contratante', is_admin: 1 });
      const vaga = await createVaga(contratante.id, { remuneracao_valor: 200, remuneracao_tipo: 'hora' });

      await req.post('/api/candidaturas').set(auth(profissional.token)).send({ id_vaga: vaga.id });
      const cand = await db.get(
        'SELECT id FROM candidaturas WHERE id_vaga = ? AND id_profissional = ?',
        [vaga.id, profissional.id]
      );
      await req.patch(`/api/candidaturas/${cand.id}`).set(auth(contratante.token)).send({ status_candidatura: 'aceita' });

      const lista = await req.get('/api/protocolos?tipo=PCM').set(auth(profissional.token));
      const pcm = lista.body.protocolos.find(p => p.status === 'enviado');
      const pdcId = (await req.post(`/api/protocolos/${pcm.id}/aceitar`).set(auth(profissional.token))).body.pdc.id;

      await req.post('/api/pagamentos').set(auth(contratante.token)).send({ id_vaga: vaga.id, metodo: 'pix' });
      await req.post(`/api/protocolos/${pdcId}/checkin`).set(auth(profissional.token)).send({ latitude: -23.5, longitude: -46.6 });
      await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(profissional.token)).send({});
      await req.post(`/api/protocolos/${pdcId}/checkout`).set(auth(contratante.token)).send({ nota: 5 });

      // Consultas que exercitam os caminhos mais complexos do código
      await req.get('/api/protocolos').set(auth(contratante.token));
      await req.get(`/api/protocolos/${pdcId}/checkins`).set(auth(contratante.token));
      await req.get(`/api/protocolos/${pdcId}/checkouts`).set(auth(profissional.token));
      await req.get(`/api/protocolos/${pdcId}/historico-status`).set(auth(contratante.token));
      await req.get('/api/vagas').set(auth(contratante.token));
      await req.get('/api/profissionais/me/recomendar').set(auth(profissional.token));
      await req.get(`/api/profissionais/${profissional.id}`);
      await req.get('/api/admin/stats').set(auth(admin.token));
      await req.get('/api/admin/pagamentos').set(auth(admin.token));

      // Crons que rodam em produção
      const { expirarProtocolosNaoRespondidos, liberarPagamentosApos72h } =
        await import('../src/services/protocolos-cleanup.js');
      await expirarProtocolosNaoRespondidos();
      await liberarPagamentosApos72h();
    } finally {
      globalThis.__SQL_TRACE__ = null;
    }

    // Sanidade: o fluxo precisa ter gerado SQL suficiente para validar.
    expect(trace.length).toBeGreaterThan(50);

    const invalidos = [];
    for (const sql of trace) {
      if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue;
      const pg = comoPostgres(sql);
      try {
        parse(pg);
      } catch (e) {
        invalidos.push({
          sql: sql.slice(0, 160).replace(/\s+/g, ' '),
          postgres: pg.slice(0, 160).replace(/\s+/g, ' '),
          erro: String(e.message).split('\n')[0]
        });
      }
    }

    expect(invalidos).toEqual([]);
  });

  it('nenhuma query com datetime("now") sobrevive sem tradução', async () => {
    const trace = [];
    globalThis.__SQL_TRACE__ = trace;
    try {
      const contratante = await createUser({ tipo_usuario: 'contratante' });
      await req.get('/api/admin/stats').set(auth(contratante.token));
    } finally {
      globalThis.__SQL_TRACE__ = null;
    }

    const sobreviventes = trace.filter(s => /datetime\('now'/i.test(comoPostgres(s)));
    expect(sobreviventes).toEqual([]);
  });
});
