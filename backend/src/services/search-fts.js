/**
 * services/search-fts.js
 *
 * M10 — Busca textual avançada usando FTS5 (SQLite) ou tsvector (PostgreSQL).
 *
 * Antes: `profissional_desejado LIKE %cuidador%` fazia full table scan.
 * Agora: usa índice FTS5/tsvector que escala para 10k+ vagas.
 *
 * Estratégia:
 *   - SQLite: cria tabela virtual `vagas_fts` com FTS5 (MATCH operator)
 *   - PostgreSQL: cria índice GIN sobre tsvector (to_tsvector + to_tsquery)
 *
 * Fallback: se FTS não disponível (banco antigo sem migration), cai para LIKE.
 */

import db from '../db/driver.js';

let ftsEnabled = false;

/**
 * Inicializa FTS (chamado em initSchema se driver suporta).
 */
export async function initFTS() {
  try {
    if (db.driver === 'sqlite') {
      // Cria tabela virtual FTS5 external content (aponta para vagas)
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vagas_fts USING fts5(
          profissional_desejado,
          servico_descricao,
          regiao,
          content='vagas',
          content_rowid='id',
          tokenize='unicode61 remove_diacritics 2'
        );

        -- Triggers para manter FTS sincronizado com a tabela vagas
        CREATE TRIGGER IF NOT EXISTS vagas_ai AFTER INSERT ON vagas BEGIN
          INSERT INTO vagas_fts(rowid, profissional_desejado, servico_descricao, regiao)
          VALUES (new.id, new.profissional_desejado, new.servico_descricao, new.regiao);
        END;

        CREATE TRIGGER IF NOT EXISTS vagas_ad AFTER DELETE ON vagas BEGIN
          INSERT INTO vagas_fts(vagas_fts, rowid, profissional_desejado, servico_descricao, regiao)
          VALUES ('delete', old.id, old.profissional_desejado, old.servico_descricao, old.regiao);
        END;

        CREATE TRIGGER IF NOT EXISTS vagas_au AFTER UPDATE ON vagas BEGIN
          INSERT INTO vagas_fts(vagas_fts, rowid, profissional_desejado, servico_descricao, regiao)
          VALUES ('delete', old.id, old.profissional_desejado, old.servico_descricao, old.regiao);
          INSERT INTO vagas_fts(rowid, profissional_desejado, servico_descricao, regiao)
          VALUES (new.id, new.profissional_desejado, new.servico_descricao, new.regiao);
        END;

        -- Popula FTS com vagas existentes (se houver)
        INSERT OR IGNORE INTO vagas_fts(rowid, profissional_desejado, servico_descricao, regiao)
        SELECT id, profissional_desejado, servico_descricao, regiao FROM vagas;
      `);
      ftsEnabled = true;
      console.log('[search-fts] FTS5 habilitado para SQLite');
    } else if (db.driver === 'postgres') {
      // PostgreSQL: índice GIN sobre tsvector
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_vagas_fts ON vagas
          USING gin(to_tsvector('portuguese', profissional_desejado || ' ' || servico_descricao || ' ' || coalesce(regiao, '')));
      `);
      ftsEnabled = true;
      console.log('[search-fts] tsvector + GIN index habilitado para PostgreSQL');
    }
  } catch (err) {
    console.warn('[search-fts] indisponível, caindo para LIKE:', err.message);
    ftsEnabled = false;
  }
}

/**
 * Busca textual em vagas ativas.
 * Usa FTS5 MATCH (SQLite) ou to_tsquery (PG) se disponível, senão LIKE.
 *
 * @param {string} query - termos de busca (ex: "cuidador alzheimer")
 * @param {Object} opts - { limite: 20, offset: 0 }
 * @returns {Promise<Array>} vagas que dão match
 */
export async function buscarVagas(query, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 20, 200);
  const offset = Math.max(0, Number(opts.offset) || 0);

  if (!query || !query.trim()) {
    // Sem query: lista todas as ativas (fallback para endpoint original)
    return await db.all(
      `SELECT v.*, u.nome AS contratante_nome
         FROM vagas v
         JOIN users u ON u.id = v.id_contratante
        WHERE v.status = 'ativa'
        ORDER BY v.criado_em DESC
        LIMIT ? OFFSET ?`,
      [limite, offset]
    );
  }

  if (ftsEnabled) {
    try {
      if (db.driver === 'sqlite') {
        // SQLite FTS5: usa MATCH operator
        // Sanitiza query: troca aspas/parêntesis por espaços e adiciona wildcard
        const safeQuery = String(query).replace(/['"()]/g, ' ').trim();
        const ftsQuery = safeQuery.split(/\s+/).filter(w => w.length > 0).map(w => `"${w}"*`).join(' ');
        if (!ftsQuery) return [];
        return await db.all(
          `SELECT v.*, u.nome AS contratante_nome,
                  bm25(vagas_fts) AS score_fts
             FROM vagas_fts
             JOIN vagas v ON v.id = vagas_fts.rowid
             JOIN users u ON u.id = v.id_contratante
            WHERE vagas_fts MATCH ?
              AND v.status = 'ativa'
            ORDER BY score_fts
            LIMIT ? OFFSET ?`,
          [ftsQuery, limite, offset]
        );
      } else {
        // PostgreSQL: to_tsquery + ts_rank
        const safeQuery = String(query).replace(/['"\\]/g, ' ').trim();
        return await db.all(
          `SELECT v.*, u.nome AS contratante_nome,
                  ts_rank(to_tsvector('portuguese', v.profissional_desejado || ' ' || v.servico_descricao || ' ' || coalesce(v.regiao, '')), plainto_tsquery('portuguese', ?)) AS score_fts
             FROM vagas v
             JOIN users u ON u.id = v.id_contratante
            WHERE to_tsvector('portuguese', v.profissional_desejado || ' ' || v.servico_descricao || ' ' || coalesce(v.regiao, '')) @@ plainto_tsquery('portuguese', ?)
              AND v.status = 'ativa'
            ORDER BY score_fts DESC
            LIMIT ? OFFSET ?`,
          [safeQuery, safeQuery, limite, offset]
        );
      }
    } catch (err) {
      console.warn('[search-fts] erro FTS, caindo para LIKE:', err.message);
      // Cai para o fallback LIKE abaixo
    }
  }

  // Fallback: LIKE simples (3 campos ORed)
  const likeQuery = `%${String(query).replace(/[%_]/g, c => '\\' + c)}%`;
  return await db.all(
    `SELECT v.*, u.nome AS contratante_nome
       FROM vagas v
       JOIN users u ON u.id = v.id_contratante
      WHERE v.status = 'ativa'
        AND (v.profissional_desejado LIKE ? ESCAPE '\\'
          OR v.servico_descricao LIKE ? ESCAPE '\\'
          OR v.regiao LIKE ? ESCAPE '\\')
      ORDER BY v.criado_em DESC
      LIMIT ? OFFSET ?`,
    [likeQuery, likeQuery, likeQuery, limite, offset]
  );
}

export function isFtsEnabled() {
  return ftsEnabled;
}
