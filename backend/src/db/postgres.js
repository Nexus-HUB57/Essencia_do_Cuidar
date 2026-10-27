/**
 * Driver PostgreSQL (node-postgres / pg) — usado em produção.
 * Ativado quando process.env.DATABASE_URL está setado.
 *
 * Schema é o mesmo do SQLite, com:
 *   - SERIAL PRIMARY KEY em vez de INTEGER AUTOINCREMENT
 *   - TEXT com CHECK constraints em vez de CHECK inline
 *   - placeholders $1, $2, ...
 *   - índices como CREATE INDEX IF NOT EXISTS (idempotente)
 */
import pg from 'pg';
const { Pool } = pg;

let _pool = null;
function getPool() {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL não configurada');
    }
    _pool = new Pool({
      connectionString,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10
    });
  }
  return _pool;
}

export const driver = 'postgres';
export const pool = new Proxy({}, {
  get(_, prop) { return getPool()[prop]; }
});

function toRows(result) {
  return result.rows;
}

/** Converte ?  → $1, $2, $3 ... para o driver pg. */
function pgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function all(sql, params = []) {
  const r = await pool.query(pgPlaceholders(sql), params);
  return toRows(r);
}
export async function get(sql, params = []) {
  const r = await pool.query(pgPlaceholders(sql), params);
  return r.rows[0];
}
export async function run(sql, params = []) {
  const r = await pool.query(pgPlaceholders(sql) + ' RETURNING id', params);
  const lastInsertRowid = r.rows[0]?.id ? Number(r.rows[0].id) : null;
  return { lastInsertRowid, changes: r.rowCount };
}
export async function exec(sql) {
  // pg não tem exec multi-statement nativo; usa query simples.
  // Para migrations completas, recomenda-se pg-migrate ou rodar via psql.
  // Aqui a gente quebra em statements e executa cada um.
  const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const s of stmts) {
    await pool.query(s);
  }
}

export async function initSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      tipo_usuario TEXT NOT NULL CHECK(tipo_usuario IN ('profissional','contratante')),
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      telefone TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      suspended_at TEXT,
      suspended_reason TEXT,
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS profissionais_detalhes (
      id SERIAL PRIMARY KEY,
      id_user INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      diploma_url TEXT,
      diploma_nome_original TEXT,
      diploma_verificado INTEGER NOT NULL DEFAULT 0,
      registro_conselho TEXT,
      tipo_registro TEXT,
      registro_verificado INTEGER NOT NULL DEFAULT 0,
      profissao TEXT,
      regiao TEXT,
      especialidades TEXT NOT NULL DEFAULT '[]',
      disponibilidade TEXT NOT NULL DEFAULT '[]',
      bio TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS vagas (
      id SERIAL PRIMARY KEY,
      id_contratante INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paciente_sexo TEXT CHECK(paciente_sexo IN ('M','F','Outro')),
      paciente_idade INTEGER,
      paciente_diagnostico TEXT,
      complexidade TEXT NOT NULL CHECK(complexidade IN ('baixa','media')),
      servico_descricao TEXT NOT NULL,
      profissional_desejado TEXT NOT NULL,
      jornada_horario TEXT,
      jornada_escala TEXT,
      tipo_contrato TEXT CHECK(tipo_contrato IN ('PJ','CLT')),
      remuneracao_tipo TEXT CHECK(remuneracao_tipo IN ('plantao','hora')),
      remuneracao_valor REAL,
      regiao TEXT,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','pausada','fechada')),
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS candidaturas (
      id SERIAL PRIMARY KEY,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      id_profissional INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mensagem TEXT,
      status_candidatura TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status_candidatura IN ('pendente','visualizada','aceita','recusada')),
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      UNIQUE(id_vaga, id_profissional)
    );

    CREATE TABLE IF NOT EXISTS mensagens (
      id SERIAL PRIMARY KEY,
      id_remetente INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_destinatario INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_vaga INTEGER REFERENCES vagas(id) ON DELETE SET NULL,
      conteudo TEXT NOT NULL,
      lida INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      payload TEXT NOT NULL,
      status_code INTEGER,
      resposta TEXT,
      erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    -- Avaliações: contratante → profissional após vaga aceita/fechada
    -- (idêntica à tabela que o routes/avaliacoes.js espera).
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id SERIAL PRIMARY KEY,
      id_contratante INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_profissional INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
      comentario TEXT,
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      UNIQUE(id_contratante, id_vaga)
    );
    CREATE INDEX IF NOT EXISTS idx_av_prof ON avaliacoes(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_av_contratante ON avaliacoes(id_contratante);

    CREATE TABLE IF NOT EXISTS verificacao_registros (
      id SERIAL PRIMARY KEY,
      id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tipo_registro TEXT NOT NULL,
      numero_registro TEXT NOT NULL,
      uf TEXT,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status IN ('pendente','aprovado','rejeitado')),
      motivo TEXT,
      verificado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      verificado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS pagamentos (
      id SERIAL PRIMARY KEY,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      id_contratante INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_profissional INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      valor_centavos INTEGER NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'brl',
      metodo TEXT NOT NULL CHECK(metodo IN ('pix','cartao','stripe')),
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status IN ('pendente','processando','pago','falhou','reembolsado','split_realizado')),
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      pix_txid TEXT,
      pix_qr_code TEXT,
      erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      atualizado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS stripe_connect (
      id_user INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_account_id TEXT NOT NULL,
      charges_enabled INTEGER NOT NULL DEFAULT 0,
      payouts_enabled INTEGER NOT NULL DEFAULT 0,
      detalhes_submetidos INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      atualizado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS admin_audit (
      id SERIAL PRIMARY KEY,
      id_admin INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      acao TEXT NOT NULL,
      alvo_tipo TEXT NOT NULL,
      alvo_id INTEGER,
      detalhes TEXT,
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      id_user_reportou INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alvo_tipo TEXT NOT NULL CHECK(alvo_tipo IN ('vaga','usuario','mensagem')),
      alvo_id INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','analisando','resolvido','descartado')),
      resolvido_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      resolvido_em TEXT
    );

    -- Favoritos: usuario favorita vagas ou profissionais (toggle)
    CREATE TABLE IF NOT EXISTS favoritos (
      id SERIAL PRIMARY KEY,
      id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK(tipo IN ('vaga', 'profissional')),
      id_recurso INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (now()::text),
      UNIQUE(id_user, tipo, id_recurso)
    );

    -- Visualizacoes de vagas (contador de views)
    CREATE TABLE IF NOT EXISTS vaga_visualizacoes (
      id SERIAL PRIMARY KEY,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      id_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL DEFAULT (now()::text)
    );

    CREATE INDEX IF NOT EXISTS idx_vagas_contratante ON vagas(id_contratante);
    CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(status);
    CREATE INDEX IF NOT EXISTS idx_cand_vaga ON candidaturas(id_vaga);
    CREATE INDEX IF NOT EXISTS idx_cand_prof ON candidaturas(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_msg_remetente ON mensagens(id_remetente);
    CREATE INDEX IF NOT EXISTS idx_msg_destinatario ON mensagens(id_destinatario);
    CREATE INDEX IF NOT EXISTS idx_pag_vaga ON pagamentos(id_vaga);
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(id_user);
    CREATE INDEX IF NOT EXISTS idx_verify_user ON verificacao_registros(id_user);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_fav_user ON favoritos(id_user);
    CREATE INDEX IF NOT EXISTS idx_vaga_views ON vaga_visualizacoes(id_vaga);
  `);

  // S2 — Idempotência do webhook Stripe (idempotente — IF NOT EXISTS via DO block)
  // Note: PG não suporta "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" em todas as versões;
  // usamos um bloco DO anônimo para capturar o erro.
  try {
    await pool.query(`ALTER TABLE pagamentos ADD COLUMN stripe_event_id TEXT`);
  } catch (e) {
    if (!/already exists/i.test(String(e.message))) throw e;
  }

  // M1-fix — Matching: profissão canônica e região de atuação do profissional.
  // Sem `profissao` o matcher não tem contra o que comparar com o
  // `profissional_desejado` da vaga (o `tipo_registro` é o conselho, não a profissão).
  for (const col of ['profissao', 'regiao']) {
    try {
      await pool.query(`ALTER TABLE profissionais_detalhes ADD COLUMN ${col} TEXT`);
    } catch (e) {
      if (!/already exists/i.test(String(e.message))) throw e;
    }
  }

  console.log('[db:postgres] schema inicializado');
}

export async function close() {
  await pool.end();
}
