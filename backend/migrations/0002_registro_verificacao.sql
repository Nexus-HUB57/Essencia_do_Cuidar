-- 0002_registro_verificacao.sql
--
-- Expande o esquema de verificacao de registro profissional.
-- Antes:  registro_verificado INTEGER 0|1 (binario)
-- Agora:  registro_verificado INTEGER 0|1|2
--          0 = nao verificado (padrao)
--          1 = validado estruturalmente (regex passou)  -> selo "Verificado"
--          2 = pendente de analise manual               -> selo "Em analise"
--
-- A nova coluna registro_verificado_em guarda quando o estado mudou
-- pela ultima vez (auditoria basica).
--
-- O CHECK nao e alterado: 0|1|2 e um superset do {0,1} e o
-- micro-migrator eh idempotente. O Postgres adapter traduz
-- `INTEGER PRIMARY KEY` para `SERIAL PRIMARY KEY` automaticamente.

-- Sem IF NOT EXISTS: o migrator garante uma única aplicação via
-- schema_migrations, e a sintaxe `ADD COLUMN IF NOT EXISTS` não é
-- suportada pela versão do better-sqlite3 nas deps. Em Postgres o
-- micro-migrator não re-aplica migrations já registradas.
ALTER TABLE profissionais_detalhes
  ADD COLUMN registro_verificado_em TEXT;

-- Backfill defensivo: tudo que ja estava como 1 vira 1 (mantem o selo).
-- Nao tocamos em valores 0 (continuam nao verificados).
UPDATE profissionais_detalhes
   SET registro_verificado_em = COALESCE(registro_verificado_em,
                                         atualizado_em,
                                         CURRENT_TIMESTAMP)
 WHERE registro_verificado = 1
   AND registro_verificado_em IS NULL;
