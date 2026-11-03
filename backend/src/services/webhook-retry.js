/**
 * services/webhook-retry.js
 *
 * N1 — Job de retry para webhooks com falha.
 *
 * Stripe e outros serviços podem reenviar eventos automaticamente, mas o
 * webhook interno para `netlify.ai` (notificação de matching) é fire-and-forget
 * — se falhar, fica só no `webhook_logs` sem reenvio.
 *
 * Esta função varre a tabela `webhook_logs` procurando entradas com:
 *   - erro != null (timeout, fetch falhou)
 *   - status_code >= 500 (server error no destino)
 *   - criado_em < 24h atrás (não vale a pena retry além disso)
 *
 * E reenvia o payload para o mesmo endpoint, atualizando o log.
 *
 * Uso:
 *   import { retryFailedWebhooks } from './services/webhook-retry.js';
 *   await retryFailedWebhooks();  // chamar de cron/manual
 *
 * Em produção, sugerir cron job a cada 30min rodando isto.
 */
import db from '../db/driver.js';

const NETLIFY_AI_URL = process.env.NETLIFY_AI_URL || 'https://netlify.ai';
const TIMEOUT = Number(process.env.NETLIFY_AI_TIMEOUT_MS || 5000);
const MAX_AGE_HOURS = Number(process.env.WEBHOOK_RETRY_MAX_AGE_HOURS || 24);
const MAX_RETRIES = Number(process.env.WEBHOOK_RETRY_MAX || 3);

/**
 * Busca webhooks com falha nas últimas MAX_AGE_HOURS e tenta reenviar.
 * @returns {Object} { tentados: number, sucesso: number, falha: number }
 */
export async function retryFailedWebhooks() {
  // Busca logs de webhook com falha (erro != NULL ou status >= 500)
  const rows = await db.all(
    `SELECT id, tipo, payload, status_code, erro, criado_em
       FROM webhook_logs
      WHERE (erro IS NOT NULL OR status_code >= 500 OR status_code IS NULL)
        AND criado_em > datetime('now', ?)
      ORDER BY criado_em ASC
      LIMIT 100`,
    [`-${MAX_AGE_HOURS} hours`]
  );

  let tentados = 0, sucesso = 0, falha = 0;

  for (const log of rows) {
    tentados++;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(NETLIFY_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: log.payload,
        signal: controller.signal
      });
      clearTimeout(timer);

      let resposta = '';
      try { resposta = await res.text(); } catch {}

      // Atualiza o log original com o resultado do retry
      await db.run(
        `UPDATE webhook_logs
            SET status_code = ?,
                resposta = ?,
                erro = NULL
          WHERE id = ?`,
        [res.status, resposta.slice(0, 1000), log.id]
      );

      if (res.ok) {
        sucesso++;
        console.log(`[webhook-retry] #${log.id} (${log.tipo}) reenviado com sucesso (${res.status})`);
      } else {
        falha++;
        console.warn(`[webhook-retry] #${log.id} (${log.tipo}) ainda falhou (${res.status})`);
      }
    } catch (err) {
      falha++;
      // Mantém o erro anterior + adiciona o novo
      const msg = err.name === 'AbortError' ? 'timeout' : err.message;
      await db.run(
        `UPDATE webhook_logs SET erro = ? WHERE id = ?`,
        [`${log.erro || 'retry'} | ${msg}`, log.id]
      );
      console.warn(`[webhook-retry] #${log.id} (${log.tipo}) erro: ${msg}`);
    }

    // Throttle: 100ms entre reenvios para não sobrecarregar
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[webhook-retry] concluído: ${tentados} tentados, ${sucesso} sucesso, ${falha} falha`);
  return { tentados, sucesso, falha };
}

/**
 * Versão simplificada para chamar como healthcheck ou cron.
 * Em produção, configurar como job no Render Cron Job ou node-cron no backend.
 */
export async function runWebhookRetryOnce() {
  try {
    return await retryFailedWebhooks();
  } catch (err) {
    console.error('[webhook-retry] fatal:', err);
    return { tentados: 0, sucesso: 0, falha: 0, error: err.message };
  }
}
