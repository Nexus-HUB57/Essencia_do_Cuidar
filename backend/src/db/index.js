/**
 * Camada de banco de dados.
 *
 * Este módulo é a fachada consumida pelo resto do backend. Ele:
 *   1. Inicializa o driver (SQLite ou Postgres) lendo `process.env.DB_DRIVER`.
 *   2. Roda o micro-migrator (garante que o schema está em dia).
 *   3. Re-exporta o driver como default para que as rotas/middlewares
 *      continuem usando `import db from '../db/index.js'`.
 *
 * Nenhuma rota precisa ser alterada: a API do driver é deliberadamente
 * compatível com a do better-sqlite3 (prepare/run/get/all/exec).
 */
import db, { DB_DRIVER, isPostgres } from './driver.js';
import { runMigrations } from './migrator.js';

// Aplica migrações pendentes em todo boot. É idempotente: rerun é no-op.
runMigrations();

if (isPostgres()) {
  console.log('[db] driver ativo: PostgreSQL (pg-native)');
} else {
  console.log('[db] driver ativo: SQLite (better-sqlite3)');
}

export { DB_DRIVER, isPostgres };
export default db;
