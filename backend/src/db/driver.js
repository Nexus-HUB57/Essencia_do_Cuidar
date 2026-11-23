/**
 * Driver de banco unificado — alterna entre SQLite (dev) e PostgreSQL (prod)
 * via env DATABASE_URL. Todas as funções retornam Promises para que o caller
 * use async/await, independente do backend escolhido.
 *
 *   - Sem DATABASE_URL  → better-sqlite3 (síncrono, wrapeado)
 *   - Com DATABASE_URL → node-postgres (pg, assíncrono nativo)
 *
 * API exposta:
 *   all(sql, params)   → rows[]                  (SELECT múltiplo)
 *   get(sql, params)   → row | undefined         (SELECT único)
 *   run(sql, params)   → { lastInsertRowid, changes }
 *   exec(sql)          → void                    (DDL em batch, ex: CREATE TABLEs)
 *   driver             → 'sqlite' | 'postgres'   (qual backend está ativo)
 *   close()            → void                    (fecha pool/conexão)
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as sqliteDriver from './sqlite.js';
import * as pgDriver from './postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usePostgres = !!process.env.DATABASE_URL;

let active;

if (usePostgres) {
  console.log('[db] driver = postgres (DATABASE_URL detectado)');
  active = pgDriver;
} else {
  const dataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  console.log('[db] driver = sqlite (default dev)');
  active = sqliteDriver;
}

export const driver = active.driver;
export const all = active.all;
export const get = active.get;
export const run = active.run;
export const exec = active.exec;
export const close = active.close;
export const initSchema = active.initSchema;

export default { driver, all, get, run, exec, close, initSchema };
