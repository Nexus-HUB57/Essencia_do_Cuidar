/**
 * Driver SQLite (better-sqlite3) — modo dev (sem DATABASE_URL).
 * API exposta via promises para que o caller não saiba se está em SQLite ou PG.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
// O diretório precisa existir ANTES de abrir o banco.
// Não vale fazer isso em driver.js — o import de './sqlite.js' no topo
// dele é avaliado antes de qualquer statement de driver.js, então o mkdir
// de lá sempre roda tarde demais e `npm run seed` quebra em clone novo.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'essencia.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function adapt(sql) {
  // Converte $1, $2 → ? para better-sqlite3. Útil quando o caller usa placeholders PG-style.
  return sql.replace(/\$\d+/g, '?');
}

export const driver = 'sqlite';

export function all(sql, params = []) {
  return db.prepare(adapt(sql)).all(...params);
}
export function get(sql, params = []) {
  return db.prepare(adapt(sql)).get(...params);
}
export function run(sql, params = []) {
  const info = db.prepare(adapt(sql)).run(...(Array.isArray(params) ? params : [params]));
  return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
}
export function exec(sql) {
  db.exec(sql);
}

/**
 * Executa SQL que pode falhar por "already exists" (idempotente para migrações).
 * Retorna true se executou, false se a coluna/tabela já existia.
 */
function safeExec(sql) {
  try { db.exec(sql); return true; } catch (e) {
    if (/already exists|duplicate column/i.test(String(e.message))) return false;
    throw e;
  }
}

export function initSchema() {
  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_usuario TEXT NOT NULL CHECK(tipo_usuario IN ('profissional','contratante')),
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      telefone TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      suspended_at TEXT,
      suspended_reason TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profissionais_detalhes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user INTEGER NOT NULL UNIQUE,
      diploma_url TEXT,
      diploma_nome_original TEXT,
      diploma_verificado INTEGER NOT NULL DEFAULT 0,
      registro_conselho TEXT,
      tipo_registro TEXT,
      registro_verificado INTEGER NOT NULL DEFAULT 0,
      especialidades TEXT NOT NULL DEFAULT '[]',
      disponibilidade TEXT NOT NULL DEFAULT '[]',
      bio TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vagas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contratante INTEGER NOT NULL,
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
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_contratante) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS candidaturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_vaga INTEGER NOT NULL,
      id_profissional INTEGER NOT NULL,
      mensagem TEXT,
      status_candidatura TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status_candidatura IN ('pendente','visualizada','aceita','recusada')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id_vaga, id_profissional),
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE CASCADE,
      FOREIGN KEY (id_profissional) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_remetente INTEGER NOT NULL,
      id_destinatario INTEGER NOT NULL,
      id_vaga INTEGER,
      conteudo TEXT NOT NULL,
      lida INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_remetente) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_destinatario) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      payload TEXT NOT NULL,
      status_code INTEGER,
      resposta TEXT,
      erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Avaliações: contratante → profissional após vaga aceita/fechada
    -- (idêntica à tabela que o routes/avaliacoes.js espera).
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contratante INTEGER NOT NULL,
      id_profissional INTEGER NOT NULL,
      id_vaga INTEGER NOT NULL,
      nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
      comentario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id_contratante, id_vaga),
      FOREIGN KEY (id_contratante) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_profissional) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_av_prof ON avaliacoes(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_av_contratante ON avaliacoes(id_contratante);

    -- Feature 2: verificação de registros (campos adicionais)
    CREATE TABLE IF NOT EXISTS verificacao_registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user INTEGER NOT NULL,
      tipo_registro TEXT NOT NULL,
      numero_registro TEXT NOT NULL,
      uf TEXT,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status IN ('pendente','aprovado','rejeitado')),
      motivo TEXT,
      verificado_por INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      verificado_em TEXT,
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (verificado_por) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Feature 3: pagamentos (Stripe / Pix)
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_vaga INTEGER NOT NULL,
      id_contratante INTEGER NOT NULL,
      id_profissional INTEGER NOT NULL,
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
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE CASCADE,
      FOREIGN KEY (id_contratante) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_profissional) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Feature 3: contas Stripe Connect dos profissionais
    CREATE TABLE IF NOT EXISTS stripe_connect (
      id_user INTEGER PRIMARY KEY,
      stripe_account_id TEXT NOT NULL,
      charges_enabled INTEGER NOT NULL DEFAULT 0,
      payouts_enabled INTEGER NOT NULL DEFAULT 0,
      detalhes_submetidos INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Feature 4: subscriptions de push (web-push)
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Feature 5: admin
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_admin INTEGER NOT NULL,
      acao TEXT NOT NULL,
      alvo_tipo TEXT NOT NULL,
      alvo_id INTEGER,
      detalhes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_admin) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Feature 5: reports / denúncias
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user_reportou INTEGER NOT NULL,
      alvo_tipo TEXT NOT NULL CHECK(alvo_tipo IN ('vaga','usuario','mensagem')),
      alvo_id INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','analisando','resolvido','descartado')),
      resolvido_por INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      resolvido_em TEXT,
      FOREIGN KEY (id_user_reportou) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (resolvido_por) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Favoritos: usuario favorita vagas ou profissionais (toggle)
    CREATE TABLE IF NOT EXISTS favoritos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('vaga', 'profissional')),
      id_recurso INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id_user, tipo, id_recurso),
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Visualizacoes de vagas (contador de views)
    CREATE TABLE IF NOT EXISTS vaga_visualizacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_vaga INTEGER NOT NULL,
      id_user INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE CASCADE,
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE SET NULL
    );

    -- M11 — Auditoria de transicoes de status de candidatura
    -- Cada mudanca (pendente → visualizada → aceita|recusada) eh registrada aqui.
    CREATE TABLE IF NOT EXISTS candidatura_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_candidatura INTEGER NOT NULL,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      alterado_por INTEGER NOT NULL,
      motivo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_candidatura) REFERENCES candidaturas(id) ON DELETE CASCADE,
      FOREIGN KEY (alterado_por) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ════════════════════════════════════════════════════════════════════
    --  SISTEMA DE PROTOCOLOS DE PAGAMENTO (Feature: Protocolos)
    --
    --  Fluxo:
    --    1. PCP (Protocolo de Custodia de Plantao) — criado quando contratante
    --       aceita uma candidatura (matching). Vaga sai do quadro ativo.
    --    2. PCM (Protocolo de Confirmacao de Matching) — enviado ao profissional
    --       para ele confirmar o matching. Pode aceitar ou recusar.
    --    3. PDC (Protocolo de Debito de Custodia) — gerado quando profissional
    --       aceita PCM. Contratante paga valor integral (plantao + taxa).
    --    4. Checkout bidirecional — ambos confirmam execução + avaliação.
    --    5. Liberação de pagamento ao profissional (até 72h após checkout).
    -- ════════════════════════════════════════════════════════════════════

    -- Tabela central: registra cada protocolo com seu estado e valores
    CREATE TABLE IF NOT EXISTS protocolos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK(tipo IN ('PCP', 'PCM', 'PDC', 'CHECKOUT')),
      id_vaga INTEGER NOT NULL,
      id_candidatura INTEGER NOT NULL,
      id_contratante INTEGER NOT NULL,
      id_profissional INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status IN ('pendente', 'enviado', 'aceito', 'recusado',
                         'pago', 'em_custodia', 'checkout_pendente',
                         'checkout_profissional', 'checkout_contratante',
                         'checkout_completo', 'liberado', 'cancelado',
                         'expirado', 'reembolsado')),
      valor_plantao_centavos INTEGER NOT NULL,
      valor_taxa_centavos INTEGER NOT NULL DEFAULT 0,
      valor_total_centavos INTEGER NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'brl',
      -- Timeline
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      enviado_em TEXT,
      respondido_em TEXT,
      pago_em TEXT,
      checkout_profissional_em TEXT,
      checkout_contratante_em TEXT,
      liberado_em TEXT,
      expira_em TEXT,  -- prazo para profissional aceitar PCM ou para contratante pagar PDC
      -- M3: prazo de 72h para liberação após checkout completo
      prazo_liberacao_horas INTEGER NOT NULL DEFAULT 72,
      -- M6: avaliação opcional do profissional pelo contratante (já existe tabela avaliacoes)
      -- M7: motivos e observações
      observacoes TEXT,
      motivo_rejeicao TEXT,
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE CASCADE,
      FOREIGN KEY (id_candidatura) REFERENCES candidaturas(id) ON DELETE CASCADE,
      FOREIGN KEY (id_contratante) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_profissional) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Pagamentos em custódia (escrow) — Stripe Connect via Connect Express
    CREATE TABLE IF NOT EXISTS pagamentos_custodia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_protocolo INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      valor_centavos INTEGER NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'brl',
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK(status IN ('pendente', 'em_custodia', 'liberado_profissional',
                         'reembolsado_contratante', 'falhou')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      pago_em TEXT,
      liberado_em TEXT,
      erro TEXT,
      FOREIGN KEY (id_protocolo) REFERENCES protocolos(id) ON DELETE CASCADE
    );

    -- Checkouts bidirecionais (profissional + contratante confirmam execução)
    CREATE TABLE IF NOT EXISTS protocolo_checkouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_protocolo INTEGER NOT NULL,
      id_user INTEGER NOT NULL,
      tipo_user TEXT NOT NULL CHECK(tipo_user IN ('profissional', 'contratante')),
      confirmado_em TEXT NOT NULL DEFAULT (datetime('now')),
      nota INTEGER CHECK(nota BETWEEN 1 AND 5),
      comentario TEXT,
      UNIQUE(id_protocolo, tipo_user),
      FOREIGN KEY (id_protocolo) REFERENCES protocolos(id) ON DELETE CASCADE,
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Log de transições de estado dos protocolos (auditoria, M11-style)
    CREATE TABLE IF NOT EXISTS protocolo_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_protocolo INTEGER NOT NULL,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      alterado_por INTEGER,
      motivo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_protocolo) REFERENCES protocolos(id) ON DELETE CASCADE
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
    CREATE INDEX IF NOT EXISTS idx_cand_status_log ON candidatura_status_log(id_candidatura);
    -- Protocolos
    CREATE INDEX IF NOT EXISTS idx_protocolos_vaga ON protocolos(id_vaga);
    CREATE INDEX IF NOT EXISTS idx_protocolos_contratante ON protocolos(id_contratante);
    CREATE INDEX IF NOT EXISTS idx_protocolos_profissional ON protocolos(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_protocolos_status ON protocolos(status);
    CREATE INDEX IF NOT EXISTS idx_protocolos_tipo ON protocolos(tipo);
    CREATE INDEX IF NOT EXISTS idx_protocolos_expira ON protocolos(expira_em);
    CREATE INDEX IF NOT EXISTS idx_custodia_protocolo ON pagamentos_custodia(id_protocolo);
    CREATE INDEX IF NOT EXISTS idx_checkouts_protocolo ON protocolo_checkouts(id_protocolo);
    CREATE INDEX IF NOT EXISTS idx_proto_log_protocolo ON protocolo_status_log(id_protocolo);
  `);

  // Migrações idempotentes para bancos pré-existentes
  safeExec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  safeExec("ALTER TABLE users ADD COLUMN suspended_at TEXT");
  safeExec("ALTER TABLE users ADD COLUMN suspended_reason TEXT");
  // Adiciona coluna atualizada_em em candidaturas (usada por notificacoes.js)
  safeExec("ALTER TABLE candidaturas ADD COLUMN atualizada_em TEXT");
  // S2 — Idempotência do webhook Stripe: coluna para registrar o último event_id processado
  safeExec("ALTER TABLE pagamentos ADD COLUMN stripe_event_id TEXT");
  // M3 — Adiciona coluna regiao_uf em vagas (validação geográfica)
  safeExec("ALTER TABLE vagas ADD COLUMN regiao_uf TEXT");
  console.log('[db:sqlite] schema inicializado em', dbPath);
}

export function close() {
  db.close();
}
