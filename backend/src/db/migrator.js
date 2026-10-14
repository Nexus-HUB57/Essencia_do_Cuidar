/**
 * Micro-migrator próprio.
 *
 * Por que não Knex/node-pg-migrate/etc.?
 *  -----------------------------------------
 *  O projeto tem 1 (uma) migração inicial, sem transformações complexas.
 *  Adotar Knex traria CLI, builder, knexfile, e outra API para a equipe
 *  aprender. Preferimos um micro-migrator síncrono (~80 linhas) que:
 *
 *    * lê `backend/migrations/*.sql` em ordem lexical;
 *    * rastreia migrações aplicadas em `schema_migrations`;
 *    * usa o driver para aplicar (db.exec multi-statement);
 *    * é idempotente e funciona em ambos os drivers.
 *
 *  Para criar uma nova migração: adicione `0002_xxx.sql` na pasta.
 *  Para rodar manualmente: `node src/db/migrator.js`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { DB_DRIVER } from './driver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Garante que a tabela de controle de migrações existe.
 * `CREATE TABLE IF NOT EXISTS` é suportado tanto em SQLite quanto em
 * Postgres ≥ 9.6.
 */
function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexical = cronológico com prefixo 0001_, 0002_, ...
}

function isApplied(version) {
  const row = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
  return Boolean(row);
}

function markApplied(version) {
  db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
}

function applyOne(file) {
  const version = file.replace(/\.sql$/, '');
  const fullPath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  db.exec(sql);
  markApplied(version);
  console.log(`[migrator:${DB_DRIVER}] aplicada: ${version}`);
}

export function runMigrations() {
  ensureMigrationsTable();
  const files = listMigrationFiles();
  if (!files.length) {
    console.log(`[migrator:${DB_DRIVER}] nenhuma migração encontrada em ${MIGRATIONS_DIR}`);
    return { applied: [], total: 0 };
  }
  const applied = [];
  for (const f of files) {
    const v = f.replace(/\.sql$/, '');
    if (isApplied(v)) continue;
    applyOne(f);
    applied.push(v);
  }
  console.log(`[migrator:${DB_DRIVER}] total aplicadas nesta execução: ${applied.length}/${files.length}`);
  return { applied, total: files.length };
}

// Permite rodar como script: `node src/db/migrator.js`
const isDirectRun = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  runMigrations();
  // encerra processo de forma limpa
  try { db.close(); } catch { /* noop */ }
  process.exit(0);
}

export default { runMigrations };
