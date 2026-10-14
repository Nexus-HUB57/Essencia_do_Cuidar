import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'essencia.db');
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Helper para "transaction" — node:sqlite (ainda) não tem db.transaction nativo.
 * Usa BEGIN/COMMIT/ROLLBACK manual com savepoint em erro.
 */
export function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  };
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_usuario TEXT NOT NULL CHECK (tipo_usuario IN ('profissional','contratante')),
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      telefone TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profissionais_detalhes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      diploma_url TEXT,
      diploma_original_name TEXT,
      diploma_uploaded_at TEXT,
      registro_conselho TEXT,
      registro_conselho_url TEXT,
      registro_conselho_original_name TEXT,
      registro_conselho_uploaded_at TEXT,
      especialidades TEXT,
      disponibilidade TEXT
    );

    CREATE TABLE IF NOT EXISTS vagas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contratante INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paciente_sexo TEXT CHECK (paciente_sexo IN ('M','F','Outro')),
      paciente_idade INTEGER,
      paciente_diagnostico TEXT,
      complexidade TEXT NOT NULL CHECK (complexidade IN ('baixa','media')),
      servico_descricao TEXT NOT NULL,
      profissional_desejado TEXT,
      jornada_horario TEXT,
      jornada_escala TEXT,
      tipo_contrato TEXT CHECK (tipo_contrato IN ('PJ','CLT')),
      remuneracao_tipo TEXT CHECK (remuneracao_tipo IN ('plantao','hora')),
      remuneracao_valor REAL,
      regiao TEXT,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','fechada')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidaturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      id_profissional INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status_candidatura TEXT NOT NULL DEFAULT 'enviada' CHECK (status_candidatura IN ('enviada','visualizada','aceita','recusada')),
      mensagem TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id_vaga, id_profissional)
    );

    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      id_remetente INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      corpo TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_vaga INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
      id_contratante INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_profissional INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
      comentario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id_vaga, id_profissional)
    );

    CREATE INDEX IF NOT EXISTS idx_vagas_contratante ON vagas(id_contratante);
    CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(status);
    CREATE INDEX IF NOT EXISTS idx_cand_vaga ON candidaturas(id_vaga);
    CREATE INDEX IF NOT EXISTS idx_cand_prof ON candidaturas(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_msg_vaga ON mensagens(id_vaga);
    CREATE INDEX IF NOT EXISTS idx_av_prof ON avaliacoes(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_av_vaga ON avaliacoes(id_vaga);
  `);

  // Migrações aditivas para bancos que já existem do commit anterior.
  const cols = db.prepare("PRAGMA table_info(profissionais_detalhes)").all();
  const has = (name) => cols.some(c => c.name === name);
  if (!has('diploma_original_name'))        db.exec("ALTER TABLE profissionais_detalhes ADD COLUMN diploma_original_name TEXT");
  if (!has('diploma_uploaded_at'))          db.exec("ALTER TABLE profissionais_detalhes ADD COLUMN diploma_uploaded_at TEXT");
  if (!has('registro_conselho_url'))        db.exec("ALTER TABLE profissionais_detalhes ADD COLUMN registro_conselho_url TEXT");
  if (!has('registro_conselho_original_name')) db.exec("ALTER TABLE profissionais_detalhes ADD COLUMN registro_conselho_original_name TEXT");
  if (!has('registro_conselho_uploaded_at'))   db.exec("ALTER TABLE profissionais_detalhes ADD COLUMN registro_conselho_uploaded_at TEXT");
}

initSchema();
