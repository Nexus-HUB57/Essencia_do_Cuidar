/**
 * Setup global dos testes de integração do backend.
 *
 * Roda ANTES de qualquer import da app (via `setupFiles` do vitest),
 * então o driver SQLite já abre o arquivo de banco de teste.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-test-'));
const dbPath = path.join(tmpDir, 'test.db');

// Isola o banco de teste do banco de desenvolvimento.
process.env.SQLITE_PATH = dbPath;
delete process.env.DATABASE_URL;

// Segredos previsíveis + sem rate limit (para não estourar em testes seguidos).
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
// Stripe/Pix rodam em MOCK — nenhuma chamada de rede real nos testes.
process.env.STRIPE_MOCK = 'true';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
process.env.NETLIFY_WEBHOOK_URL = '';

globalThis.__TEST_DB_PATH__ = dbPath;
globalThis.__TEST_TMP_DIR__ = tmpDir;

process.on('exit', () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
});
