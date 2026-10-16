/**
 * Driver de banco — abstrai better-sqlite3 (dev) e pg-native (prod)
 * atrás de uma API síncrona e uniforme, propositalmente compatível
 * com better-sqlite3.
 *
 *   const db = require('./driver').default
 *   db.exec(sql)                            // DDL multi-statement
 *   db.prepare(sql).run(...params)          // INSERT/UPDATE/DELETE
 *   db.prepare(sql).get(...params)          // uma linha
 *   db.prepare(sql).all(...params)          // várias linhas
 *   db.run(sql, params)                     // atalho
 *   db.get(sql, params)
 *   db.all(sql, params)
 *
 *  A escolha do driver é feita por process.env.DB_DRIVER
 *  ('sqlite' | 'postgres', default 'sqlite').
 *
 *  Por que pg-native em vez de `pg`?
 *  ----------------------------------
 *  O `pg` é assíncrono; a base de código atual consome o driver de forma
 *  síncrona (db.prepare(...).get(...)). Para preservar a API e não
 *  tocar nas rotas, usamos `pg-native`, que é o wrapper síncrono oficial
 *  em cima do libpq. Mantemos `pg` como dependência porque algumas
 *  ferramentas (drivers, tipos) são úteis em código opcional.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import PgNativeClient from 'pg-native';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_DRIVER = (
  process.env.DB_DRIVER
  || (process.env.DATABASE_URL ? 'postgres' : 'sqlite')
).toLowerCase();

export function isPostgres() {
  return DB_DRIVER === 'postgres' || DB_DRIVER === 'pg' || DB_DRIVER === 'postgresql';
}

export function isSqlite() {
  return DB_DRIVER === 'sqlite' || DB_DRIVER === 'better-sqlite3';
}

/* ------------------------------------------------------------------ *
 *  Helpers de adaptação de SQL
 * ------------------------------------------------------------------ */

/**
 * Converte placeholders "?" para "$1, $2, ..." (PostgreSQL) respeitando
 * strings e comentários. Usado em tempo de execução para DML que vem
 * das rotas (que ainda usam "?").
 */
export function convertPlaceholders(sql) {
  let out = '';
  let i = 0;
  let paramIdx = 0;
  let inString = false;
  let stringChar = '';
  while (i < sql.length) {
    const c = sql[i];
    if (inString) {
      out += c;
      if (c === stringChar && sql[i - 1] !== '\\') inString = false;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      inString = true;
      stringChar = c;
      out += c;
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += sql[i]; i++; }
      continue;
    }
    if (c === '?') {
      paramIdx++;
      out += '$' + paramIdx;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Adapta funções/tipos SQLite -> Postgres para DML (INSERT/UPDATE/SELECT).
 * Aplicado em cada query vinda das rotas antes de ir para o libpq.
 */
export function adaptDmlToPostgres(sql) {
  return sql.replace(/datetime\s*\(\s*'now'\s*(?:,\s*'localtime'\s*)?\)/gi, 'CURRENT_TIMESTAMP');
}

/**
 * Adapta DDL neutro -> Postgres. Aplicado em cada statement vindo dos
 * arquivos de migração antes de ir para o libpq.
 */
export function adaptDdlToPostgres(sql) {
  return sql
    // datetime('now') -> CURRENT_TIMESTAMP (padrão SQL, ambos suportam)
    .replace(/datetime\s*\(\s*'now'\s*(?:,\s*'localtime'\s*)?\)/gi, 'CURRENT_TIMESTAMP')
    // INTEGER PRIMARY KEY [AUTOINCREMENT] -> SERIAL/BIGSERIAL PRIMARY KEY
    .replace(/(\b)(?:INTEGER|integer)\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, '$1BIGSERIAL PRIMARY KEY')
    .replace(/(\b)(?:INTEGER|integer)\s+PRIMARY\s+KEY\b(?!\s+AUTOINCREMENT)/gi, '$1SERIAL PRIMARY KEY');
}

/**
 * Quebra um bloco SQL multi-statement em statements individuais,
 * respeitando strings e comentários. Usado para exec() no driver Postgres,
 * já que o libpq (via pg-native) só aceita um statement por chamada.
 */
export function splitSql(sql) {
  const stmts = [];
  let buf = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  while (i < sql.length) {
    const c = sql[i];
    buf += c;
    if (inString) {
      if (c === stringChar && sql[i - 1] !== '\\') inString = false;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      inString = true;
      stringChar = c;
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    if (c === ';') {
      const trimmed = buf.trim();
      // descarta strings vazias / só com `;`
      if (trimmed.length > 1) stmts.push(trimmed);
      buf = '';
    }
    i++;
  }
  const tail = buf.trim();
  if (tail.length > 0) stmts.push(tail);
  return stmts;
}

/* ------------------------------------------------------------------ *
 *  Driver SQLite (better-sqlite3)
 * ------------------------------------------------------------------ */

class SqliteDriver {
  constructor(opts = {}) {
    const DATA_DIR = opts.dataDir || path.resolve(__dirname, '../../../data');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const dbPath = path.join(DATA_DIR, 'essencia.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.dbPath = dbPath;
    this.kind = 'sqlite';
  }
  exec(sql) { this.db.exec(sql); }
  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params)
    };
  }
  run(sql, params = []) { return this.prepare(sql).run(...params); }
  get(sql, params = []) { return this.prepare(sql).get(...params); }
  all(sql, params = []) { return this.prepare(sql).all(...params); }
  close() { try { this.db.close(); } catch { /* noop */ } }
}

/* ------------------------------------------------------------------ *
 *  Driver PostgreSQL (pg-native)
 * ------------------------------------------------------------------ */

class PgDriver {
  constructor() {
    const connectionString = process.env.DATABASE_URL
      || (() => {
        const { PGHOST = 'localhost', PGPORT = '5432', PGUSER = 'postgres',
                PGPASSWORD = '', PGDATABASE = 'postgres' } = process.env;
        return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
      })();
    this.connectionString = connectionString;
    this.client = new PgNativeClient();
    this.client.connectSync(connectionString);
    this.kind = 'postgres';
  }
  exec(sql) {
    const adapted = adaptDdlToPostgres(sql);
    const stmts = splitSql(adapted);
    for (const s of stmts) {
      this.client.querySync(s);
    }
  }
  prepare(sql) {
    const self = this;
    return {
      run: (...params) => self._run(sql, params),
      get: (...params) => self._get(sql, params),
      all: (...params) => self._all(sql, params)
    };
  }
  _converted(sql) {
    return convertPlaceholders(sql);
  }
  _isInsert(sql) {
    return /^\s*insert\b/i.test(sql);
  }
  _run(sql, params) {
    let converted = this._converted(sql);
    if (this._isInsert(converted) && !/\bRETURNING\b/i.test(converted)) {
      // mantém qualquer ";" final, depois injeta RETURNING id
      converted = converted.replace(/[;\s]*$/, '') + ' RETURNING id';
    }
    const adapted = adaptDmlToPostgres(converted);
    const result = this.client.querySync(adapted, params);
    const rows = Array.isArray(result) ? result : [];
    const lastInsertRowid = rows[0] ? rows[0].id : null;
    // Em INSERT/UPDATE/DELETE, querySync devolve as linhas afetadas (linhas
    // retornadas por RETURNING ou affected rows). Para o nosso uso isso é
    // suficiente para o consumidor checar `changes > 0`.
    const changes = rows.length;
    return { lastInsertRowid, changes };
  }
  _get(sql, params) {
    const adapted = adaptDmlToPostgres(this._converted(sql));
    const result = this.client.querySync(adapted, params);
    return Array.isArray(result) ? result[0] : undefined;
  }
  _all(sql, params) {
    const adapted = adaptDmlToPostgres(this._converted(sql));
    const result = this.client.querySync(adapted, params);
    return Array.isArray(result) ? result : [];
  }
  run(sql, params = []) { return this._run(sql, params); }
  get(sql, params = []) { return this._get(sql, params); }
  all(sql, params = []) { return this._all(sql, params); }
  close() { try { this.client.end(); } catch { /* noop */ } }
}

/* ------------------------------------------------------------------ *
 *  Singleton
 * ------------------------------------------------------------------ */

let _instance = null;

export function getDriver() {
  if (_instance) return _instance;
  if (isPostgres()) {
    _instance = new PgDriver();
  } else {
    _instance = new SqliteDriver();
  }
  return _instance;
}

export function resetDriver() {
  if (_instance) {
    try { _instance.close(); } catch { /* noop */ }
  }
  _instance = null;
}

const driver = getDriver();
export default driver;
