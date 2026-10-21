-- 0003_admin.sql
-- Adiciona suporte a moderação administrativa de vagas.
--
-- Mudanças:
--   1. users.tipo_usuario: amplia o CHECK para aceitar 'admin'.
--      SQLite não tem ALTER CONSTRAINT, então recriamos a tabela de
--      forma portável (criamos __users_new, copiamos, drop, rename).
--      Postgres aceita a versão direta com DROP CONSTRAINT.
--   2. vagas ganha colunas de moderação:
--        moderacao_status  TEXT NOT NULL DEFAULT 'ok'  ('ok'|'flagged'|'removida')
--        moderacao_motivo  TEXT
--        moderado_por      INTEGER
--        moderado_em       TEXT
--      Não mexe no status da vaga (ativa/pausada/fechada) — a moderação
--      é uma camada ortogonal e cumulativa.
--   3. Tabela vagas_moderacao: log append-only de toda ação do admin
--      (id, id_vaga, id_admin, acao, motivo, criado_em).
--
-- NOTA: Não usamos `ADD COLUMN IF NOT EXISTS` porque a versão do
-- better-sqlite3 nas deps não aceita essa sintaxe. O migrator garante
-- que cada migration roda uma única vez via schema_migrations.

-- 1) Recria users com CHECK ampliado. Funciona em SQLite.
--    (Em Postgres, a forma equivalente seria ALTER TABLE ... DROP CONSTRAINT
--    + ADD CONSTRAINT. Como o micro-migrator é genérico, usamos o caminho
--    SQLite — que também é válido em Postgres.)
CREATE TABLE __users_new (
  id INTEGER PRIMARY KEY,
  tipo_usuario TEXT NOT NULL CHECK(tipo_usuario IN ('profissional','contratante','admin')),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  telefone TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  suspended_at TEXT,
  suspended_reason TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO __users_new (id, tipo_usuario, nome, email, senha_hash, telefone, is_admin, suspended_at, suspended_reason, criado_em)
SELECT id, tipo_usuario, nome, email, senha_hash, telefone, COALESCE(is_admin, 0), suspended_at, suspended_reason, criado_em FROM users;
DROP TABLE users;
ALTER TABLE __users_new RENAME TO users;

-- 2) Colunas em vagas
ALTER TABLE vagas ADD COLUMN moderacao_status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE vagas ADD COLUMN moderacao_motivo TEXT;
ALTER TABLE vagas ADD COLUMN moderado_por INTEGER;
ALTER TABLE vagas ADD COLUMN moderado_em TEXT;

CREATE INDEX idx_vagas_moderacao ON vagas(moderacao_status);

-- 3) Log de moderação (append-only)
CREATE TABLE vagas_moderacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_vaga INTEGER NOT NULL,
  id_admin INTEGER NOT NULL,
  acao TEXT NOT NULL CHECK(acao IN ('flag','unflag','remove','restore','view')),
  motivo TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_vaga) REFERENCES vagas(id) ON DELETE CASCADE,
  FOREIGN KEY (id_admin) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_vm_vaga ON vagas_moderacao(id_vaga);
CREATE INDEX idx_vm_admin ON vagas_moderacao(id_admin);
CREATE INDEX idx_vm_criado ON vagas_moderacao(criado_em);
