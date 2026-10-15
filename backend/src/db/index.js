/**
 * Compat: re-exporta o driver unificado.
 * Para escolher SQLite (dev) vs PostgreSQL (prod), basta setar DATABASE_URL.
 */
export { default, driver, all, get, run, exec, close, initSchema } from './driver.js';
export { default as db } from './driver.js';
