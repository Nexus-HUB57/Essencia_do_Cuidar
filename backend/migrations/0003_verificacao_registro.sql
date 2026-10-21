-- 0003_verificacao_registro.sql
-- Adiciona estado de verificação de conselho profissional e tabela
-- de logs das tentativas. A verificação automática é best-effort:
-- quando o portal do conselho não responder / não tiver API pública,
-- o status fica 'pendente' e fica aguardando revisão manual.

ALTER TABLE profissionais_detalhes ADD COLUMN verificacao_status TEXT NOT NULL DEFAULT 'pendente'
  CHECK(verificacao_status IN ('pendente','verificado_auto','verificado_manual','rejeitado','inativo'));
ALTER TABLE profissionais_detalhes ADD COLUMN verificacao_fonte TEXT;
ALTER TABLE profissionais_detalhes ADD COLUMN verificacao_observacao TEXT;
ALTER TABLE profissionais_detalhes ADD COLUMN verificado_em TEXT;

CREATE TABLE IF NOT EXISTS verificacao_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_profissional INTEGER NOT NULL,
  conselho TEXT NOT NULL,                   -- 'CRM' | 'COREN' | 'CREFITO' | 'CRP' | 'CRN' | ...
  registro_conselho TEXT NOT NULL,
  resultado_encontrado INTEGER NOT NULL,    -- 0/1
  resultado_json TEXT NOT NULL,             -- JSON com o payload bruto do adapter
  fonte TEXT NOT NULL,                      -- 'auto' | 'manual'
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_profissional) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verificacao_prof ON verificacao_logs(id_profissional);
