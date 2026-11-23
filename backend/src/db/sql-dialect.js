/**
 * db/sql-dialect.js
 *
 * Adaptador de SQL: traduz o dialeto SQLite (como o código é escrito hoje)
 * para o dialeto PostgreSQL (produção).
 *
 * ── Por que isto existe ──────────────────────────────────────────────
 *
 * Todo o código de rotas e serviços usa construções que só existem no
 * SQLite:
 *
 *   - `datetime('now')`            → 71 ocorrências em 12 arquivos
 *   - `datetime('now', '-24 hours')`
 *   - `datetime('now', ?)`
 *   - `INSERT OR IGNORE INTO ...`   → 3 ocorrências
 *
 * Nenhuma delas existe no PostgreSQL: `datetime()` não é uma função
 * (não existe schema `datetime`; o PG chama de `date_trunc`), e
 * `INSERT OR IGNORE` é SQLite puro (o PG usa `ON CONFLICT DO NOTHING`).
 *
 * O README afirma "Migração para PostgreSQL em produção ✅", mas o fluxo
 * inteiro de custódia/check-out — justamente o que move dinheiro — quebrava
 * no primeiro `datetime('now')` executado contra o PG.
 *
 * ── Contrato de formato ───────────────────────────────────────────────
 *
 * O SQLite grava timestamps como TEXT no formato `YYYY-MM-DD HH:MM:SS`
 * em UTC. O frontend depende desse formato: faz `new Date(row.criado_em + 'Z')`.
 *
 * Se o PG gravasse `2026-11-12 08:20:56.123456+00`, o `+ 'Z'` do frontend
 * viraria `+00Z` — data inválida, `Invalid Date` na tela.
 *
 * Por isso o adaptador produz TEXT no MESMO formato do SQLite, usando
 * `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`. Assim:
 *
 *   - a ordenação/comparação por texto continua funcionando (ordem lexicográfica
 *     = ordem cronológica, porque o formato é de largura fixa);
 *   - o frontend não precisa mudar;
 *   - as duas bases continuam byte-compatíveis no que importa.
 */

/**
 * Expressão SQL que produz "agora" em UTC no formato canônico do SQLite.
 * @type {string}
 */
export const PG_NOW = "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

/**
 * Converte um offset do SQLite ("-24 hours", "-30 day") no trecho
 * `INTERVAL` correspondente do PostgreSQL.
 *
 * O SQLite aceita `-30 day` (singular) e `-24 hours`; o PG exige
 * `INTERVAL '30 days'`. A unidade é normalizada para o plural aceito
 * pelo PG.
 *
 * @param {string} offset — ex: "-24 hours"
 * @returns {string} — ex: "INTERVAL '24 hours'"
 */
function pgInterval(offset) {
  const bruto = String(offset).trim();
  const negativo = bruto.startsWith('-');
  const limpo = bruto.replace(/^[-+]/, '').trim();

  const partes = limpo.split(/\s+/);
  const numero = partes[0];
  const unidade = (partes[1] || 'hours').toLowerCase();

  // 'day' → 'days', 'hour' → 'hours'; 'day'/'days' são as formas aceitas
  // pelo PG para dia; para as demais, o plural é o padrão.
  const unidadePlural = unidade.endsWith('s') ? unidade : `${unidade}s`;

  return `${negativo ? '-' : '+'} INTERVAL '${numero} ${unidadePlural}'`;
}

/**
 * Reescreve `datetime('now', ...)` — a construção mais usada do código.
 *
 * @param {string} sql
 * @returns {string}
 */
function adaptDatetime(sql) {
  let out = sql;

  // 1) datetime('now', '<literal>')  →  to_char((CURRENT_TIMESTAMP ± INTERVAL ...) ...)
  out = out.replace(
    /datetime\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi,
    (_m, offset) => `to_char((CURRENT_TIMESTAMP ${pgInterval(offset)}) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
  );

  // 2) datetime('now', ?)  →  to_char((CURRENT_TIMESTAMP + ($1::interval)) ...)
  //    O parâmetro continua negativo (ex: '-72 hours'), então o `+` com um
  //    interval negativo equivale ao `-` do SQLite.
  out = out.replace(
    /datetime\(\s*'now'\s*,\s*\?\s*\)/gi,
    `to_char((CURRENT_TIMESTAMP + (?::interval)) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
  );

  // 3) datetime('now')  →  to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', ...)
  out = out.replace(
    /datetime\(\s*'now'\s*\)/gi,
    PG_NOW
  );

  return out;
}

/**
 * Reescreve `INSERT OR IGNORE INTO` — que no PG vira `ON CONFLICT DO NOTHING`.
 *
 * @param {string} sql
 * @returns {string}
 */
function adaptInsertOrIgnore(sql) {
  // Forma VALUES: o ON CONFLICT entra logo depois da tupla de VALUES.
  const valoresRe = /INSERT\s+OR\s+IGNORE\s+INTO\s+([a-z_][a-z0-9_]*)\s*(\([^)]*\))?\s*VALUES\s*(\([^;]*?\))/gi;
  const comValues = sql.replace(valoresRe, (_m, tabela, cols, vals) =>
    `INSERT INTO ${tabela}${cols ? ' ' + cols : ''} VALUES ${vals} ON CONFLICT DO NOTHING`
  );
  if (comValues !== sql) return comValues;

  // Forma SELECT (INSERT ... SELECT): o ON CONFLICT entra no fim da statement.
  const selectRe = /INSERT\s+OR\s+IGNORE\s+INTO\s+([a-z_][a-z0-9_]*)\s*(\([^)]*\))?\s*SELECT\b/gi;
  if (!selectRe.test(sql)) return sql;

  const semOr = sql.replace(selectRe, (_m, tabela, cols) =>
    `INSERT INTO ${tabela}${cols ? ' ' + cols : ''} SELECT`
  );
  return semOr.replace(/\s*;\s*$/, '').trimEnd() + ' ON CONFLICT DO NOTHING';
}

/**
 * Converte uma statement SQL do dialeto SQLite para o dialeto PostgreSQL.
 *
 * Espera uma única statement por chamada — `exec()` divide antes de
 * chamar, porque o `ON CONFLICT` da forma INSERT...SELECT precisa ser
 * anexado ao fim da statement correta.
 *
 * @param {string} sql
 * @returns {string}
 */
export function toPostgres(sql) {
  if (!sql || typeof sql !== 'string') return sql;
  return adaptInsertOrIgnore(adaptDatetime(sql));
}
