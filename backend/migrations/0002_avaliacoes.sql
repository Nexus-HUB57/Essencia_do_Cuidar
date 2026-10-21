-- 0002_avaliacoes.sql
-- Adiciona tabela de avaliações pós-atendimento.
-- Cada lado (contratante e profissional) avalia o outro de forma
-- independente após a vaga ser fechada.

CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_candidatura INTEGER NOT NULL,
  id_avaliador INTEGER NOT NULL,
  id_avaliado INTEGER NOT NULL,
  avaliador_tipo TEXT NOT NULL CHECK(avaliador_tipo IN ('contratante','profissional')),
  nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
  comentario TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_candidatura, id_avaliador),
  FOREIGN KEY (id_candidatura) REFERENCES candidaturas(id) ON DELETE CASCADE,
  FOREIGN KEY (id_avaliador) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (id_avaliado) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_av_candidatura ON avaliacoes(id_candidatura);
CREATE INDEX IF NOT EXISTS idx_av_avaliado ON avaliacoes(id_avaliado);
