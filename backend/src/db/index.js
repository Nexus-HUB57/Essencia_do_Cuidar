import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'essencia.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Schema completo do banco — cobre users, profissionais_detalhes, vagas,
 * candidaturas, mensagens (chat) e logs de webhook netlify.ai.
 */
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_usuario TEXT NOT NULL CHECK(tipo_usuario IN ('profissional','contratante')),
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      telefone TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profissionais_detalhes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_user INTEGER NOT NULL UNIQUE,
      diploma_url TEXT,
      diploma_nome_original TEXT,
      diploma_verificado INTEGER NOT NULL DEFAULT 0,
      registro_conselho TEXT,
      tipo_registro TEXT,                     -- CRM, COREN, CREFITO, CRP, CRN, ...
      registro_verificado INTEGER NOT NULL DEFAULT 0,
      especialidades TEXT NOT NULL DEFAULT '[]',   -- JSON array
      disponibilidade TEXT NOT NULL DEFAULT '[]',  -- JSON array
      bio TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vagas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contratante INTEGER NOT NULL,
      -- Paciente
      paciente_sexo TEXT CHECK(paciente_sexo IN ('M','F','Outro')),
      paciente_idade INTEGER,
      paciente_diagnostico TEXT,
      complexidade TEXT NOT NULL CHECK(complexidade IN ('baixa','media')),
      -- Serviço
      servico_descricao TEXT NOT NULL,
      profissional_desejado TEXT NOT NULL,    -- "Técnico de Enfermagem", etc.
      -- Jornada
      jornada_horario TEXT,
      jornada_escala TEXT,
      -- Contrato & remuneração
      tipo_contrato TEXT CHECK(tipo_contrato IN ('PJ','CLT')),
      remuneracao_tipo TEXT CHECK(remuneracao_tipo IN ('plantao','hora')),
      remuneracao_valor REAL,
      -- Endereço
      regiao TEXT,
      -- Controle
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

    CREATE INDEX IF NOT EXISTS idx_vagas_contratante ON vagas(id_contratante);
    CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(status);
    CREATE INDEX IF NOT EXISTS idx_cand_vaga ON candidaturas(id_vaga);
    CREATE INDEX IF NOT EXISTS idx_cand_prof ON candidaturas(id_profissional);
    CREATE INDEX IF NOT EXISTS idx_msg_remetente ON mensagens(id_remetente);
    CREATE INDEX IF NOT EXISTS idx_msg_destinatario ON mensagens(id_destinatario);

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,                     -- 'vaga_criada' | 'candidatura_enviada' | ...
      payload TEXT NOT NULL,
      status_code INTEGER,
      resposta TEXT,
      erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contratante INTEGER NOT NULL,
      id_profissional INTEGER NOT NULL,
      id_vaga INTEGER,
      nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
      comentario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id_contratante, id_vaga),  -- 1 avaliação por vaga por contratante
      FOREIGN KEY (id_contratante) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_profissional) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_av_prof ON avaliacoes(id_profissional);
  `);

  console.log('[db] schema inicializado em', dbPath);
}

initSchema();

export default db;
