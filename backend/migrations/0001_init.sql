-- 0001_init.sql — DDL inicial (dialeto-neutro)
--
-- Este arquivo é a fonte de verdade do schema. É escrito em SQL
-- portável entre SQLite e PostgreSQL. O driver converte os
-- poucos pontos divergentes em tempo de boot:
--
--   * INTEGER PRIMARY KEY         -> SERIAL PRIMARY KEY     (Postgres)
--   * datetime('now')             -> CURRENT_TIMESTAMP      (Postgres)
--
-- Nenhuma rota precisa mudar para usar este schema: a abstração
-- de driver aceita ambos os backends.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  tipo_usuario TEXT NOT NULL CHECK(tipo_usuario IN ('profissional','contratante')),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  telefone TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profissionais_detalhes (
  id INTEGER PRIMARY KEY,
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
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vagas (
  id INTEGER PRIMARY KEY,
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
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidaturas (
  id INTEGER PRIMARY KEY,
  id_vaga INTEGER NOT NULL,
  id_profissional INTEGER NOT NULL,
  mensagem TEXT,
  status_candidatura TEXT NOT NULL DEFAULT 'pendente'
    CHECK(status_candidatura IN ('pendente','visualizada','aceita','recusada')),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id_vaga, id_profissional)
);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY,
  id_remetente INTEGER NOT NULL,
  id_destinatario INTEGER NOT NULL,
  id_vaga INTEGER,
  conteudo TEXT NOT NULL,
  lida INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vagas_contratante ON vagas(id_contratante);
CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(status);
CREATE INDEX IF NOT EXISTS idx_cand_vaga ON candidaturas(id_vaga);
CREATE INDEX IF NOT EXISTS idx_cand_prof ON candidaturas(id_profissional);
CREATE INDEX IF NOT EXISTS idx_msg_remetente ON mensagens(id_remetente);
CREATE INDEX IF NOT EXISTS idx_msg_destinatario ON mensagens(id_destinatario);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  status_code INTEGER,
  resposta TEXT,
  erro TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
