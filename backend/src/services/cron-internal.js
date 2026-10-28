/**
 * services/cron-internal.js
 *
 * Cron jobs internos (opcional) — usa setTimeout recursivo em vez de
 * biblioteca externa, para não adicionar dependência.
 *
 * Para ambientes sem host crontab (ex.: Render free tier sem Cron Jobs),
 * setar ENABLE_INTERNAL_CRON=true para rodar os jobs dentro do próprio
 * processo do backend.
 *
 * Em produção com múltiplas instâncias, NÃO usar cron interno —
 * cada instância rodaria os jobs em paralelo, duplicando work.
 * Usar CronJobs dedicados (k8s CronJob, Render Cron, ou host crontab).
 *
 * Jobs:
 *   - A cada 30min: retry de webhooks com falha (services/webhook-retry.js)
 *   - A cada 1h: protocolos PPP + CGPP (services/protocolos-cleanup.js)
 *   - Diário às 3h: expirar candidaturas antigas (services/candidatura-cleanup.js)
 *   - Semanal (domingo 4h): limpar blacklist de tokens expirados
 */
import { retryFailedWebhooks } from './webhook-retry.js';
import { expirarCandidaturasAntigas } from './candidatura-cleanup.js';

let jobsAtivos = false;
const timers = [];

/**
 * Inicia os cron jobs internos se ENABLE_INTERNAL_CRON=true.
 * Idempotente: chamar várias vezes não duplica jobs.
 */
export function startInternalCron() {
  if (jobsAtivos) return;
  if (process.env.ENABLE_INTERNAL_CRON !== 'true') {
    console.log('[cron-internal] desabilitado (setar ENABLE_INTERNAL_CRON=true para ativar)');
    return;
  }

  console.log('[cron-internal] iniciando jobs internos (atenção: NÃO usar em multi-instância)');

  // Job 1: retry de webhooks a cada 30 min
  const intervalWebhook = 30 * 60 * 1000;
  const t1 = setInterval(async () => {
    try {
      const r = await retryFailedWebhooks();
      console.log(`[cron-internal] webhook-retry: tentados=${r.tentados} sucesso=${r.sucesso} falha=${r.falha}`);
    } catch (err) {
      console.error('[cron-internal] webhook-retry falhou:', err.message);
    }
  }, intervalWebhook);
  timers.push(t1);

  // Job 2: protocolos cleanup (PPP + expiração + CGPP) a cada 1h
  const intervalProtocolos = 60 * 60 * 1000;
  const t2 = setInterval(async () => {
    try {
      const { rodarProtocolosCleanup } = await import('./protocolos-cleanup.js');
      const r = await rodarProtocolosCleanup();
      console.log(`[cron-internal] protocolos-cleanup: ppp=${JSON.stringify(r.ppp)} expiracao=${JSON.stringify(r.expiracao)} liberacao=${JSON.stringify(r.liberacao)}`);
    } catch (err) {
      console.error('[cron-internal] protocolos-cleanup falhou:', err.message);
    }
  }, intervalProtocolos);
  timers.push(t2);

  // Job 3: expiração de candidaturas a cada 24h (a partir do boot, ~24h depois)
  const intervalCleanup = 24 * 60 * 60 * 1000;
  const t3 = setInterval(async () => {
    try {
      const r = await expirarCandidaturasAntigas();
      console.log(`[cron-internal] candidatura-cleanup: expiradas=${r.expiradas}`);
    } catch (err) {
      console.error('[cron-internal] candidatura-cleanup falhou:', err.message);
    }
  }, intervalCleanup);
  timers.push(t3);

  // Job 4 (semanal): limpar blacklist expirada
  const intervalBlacklist = 7 * 24 * 60 * 60 * 1000;
  const t4 = setInterval(async () => {
    try {
      const { limparBlacklistExpirada } = await import('./auth-advanced.js');
      const r = await limparBlacklistExpirada();
      console.log(`[cron-internal] blacklist-cleanup: ${r.removidos} jtis expirados removidos`);
    } catch (err) {
      console.error('[cron-internal] blacklist-cleanup falhou:', err.message);
    }
  }, intervalBlacklist);
  timers.push(t4);

  // Roda o webhook-retry imediatamente no boot (não espera 30 min)
  setTimeout(async () => {
    try {
      const r = await retryFailedWebhooks();
      console.log(`[cron-internal] webhook-retry (inicial): tentados=${r.tentados} sucesso=${r.sucesso}`);
    } catch (err) {
      console.error('[cron-internal] webhook-retry (inicial) falhou:', err.message);
    }
  }, 5000);  // 5s após boot

  // Roda o protocolos-cleanup imediatamente no boot (para não esperar 1h)
  setTimeout(async () => {
    try {
      const { rodarProtocolosCleanup } = await import('./protocolos-cleanup.js');
      const r = await rodarProtocolosCleanup();
      console.log(`[cron-internal] protocolos-cleanup (inicial): ppp=${JSON.stringify(r.ppp)}`);
    } catch (err) {
      console.error('[cron-internal] protocolos-cleanup (inicial) falhou:', err.message);
    }
  }, 10000);  // 10s após boot

  jobsAtivos = true;
  console.log('[cron-internal] 4 jobs agendados: webhook-retry (30min), protocolos-cleanup (1h), candidatura-cleanup (24h), blacklist-cleanup (7d)');
}

/**
 * Para todos os jobs (para graceful shutdown).
 */
export function stopInternalCron() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  jobsAtivos = false;
  console.log('[cron-internal] jobs parados');
}
