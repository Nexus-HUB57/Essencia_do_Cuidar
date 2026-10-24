/**
 * Script de migração para PostgreSQL.
 * Cria o schema no banco target (DATABASE_URL).
 *
 * Uso:
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/migrate-pg.js
 */
import 'dotenv/config';
import { initSchema, close, driver } from '../src/db/driver.js';

if (!process.env.DATABASE_URL) {
  console.error('❌ Defina DATABASE_URL antes de rodar este script.');
  console.error('   Ex: DATABASE_URL=postgres://user:pass@localhost:5432/essencia node scripts/migrate-pg.js');
  process.exit(1);
}

if (driver !== 'postgres') {
  console.error('❌ Este script só roda com driver postgres. Verifique DATABASE_URL.');
  process.exit(1);
}

console.log('[migrate-pg] driver =', driver);
console.log('[migrate-pg] criando schema...');

await initSchema();
console.log('[migrate-pg] ✅ schema criado/atualizado');

await close();
process.exit(0);
