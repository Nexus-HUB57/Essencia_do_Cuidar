/**
 * services/alerting.js
 *
 * Alertas para eventos críticos do sistema.
 *
 * Hook de alerta: quando o healthcheck retorna 503 (DB cair) ou
 * taxa de falha de webhooks passa de 50%, dispara um alerta.
 *
 * Tipos de alerta:
 *   - db_down: DB indisponível (503 do /api/health)
 *   - webhook_critical: > 50% de webhooks falhando nas últimas 24h
 *   - webhook_warning: > 10% de webhooks falhando
 *
 * Como usar:
 *   - Monitor externo (UptimeRobot, Render Cron, k8s probe) chama
 *     GET /api/health periodicamente. Se receber 503, deve disparar
 *     alerta (email, Slack, PagerDuty).
 *   - Endpoint GET /api/admin/alerts para admin ver alertas ativas
 *
 * Para integração com Slack/Email, configurar:
 *   - SLACK_WEBHOOK_URL (env): URL do incoming webhook
 *   - ALERT_EMAIL_TO (env): destinatário (requer transport SMTP)
 *   - SMTP_URL (env): smtp://user:pass@host:587
 *
 * Sem estas env vars, alertas são apenas logados no servidor.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
const ALERTS_FILE = process.env.ALERTS_FILE || './data/alerts.log';

let lastAlertTime = {};

/**
 * Registra alerta (escreve no log + envia para Slack se configurado).
 *
 * @param {string} tipo - 'db_down' | 'webhook_critical' | 'webhook_warning' | ...
 * @param {object} detalhes - dados do alerta
 */
export async function emitirAlerta(tipo, detalhes = {}) {
  // Throttle: não repetir mesmo alerta em menos de 5 min
  const now = Date.now();
  const last = lastAlertTime[tipo] || 0;
  if (now - last < 5 * 60 * 1000) {
    return;  // throttled
  }
  lastAlertTime[tipo] = now;

  const alerta = {
    tipo,
    severidade: tipo.includes('critical') || tipo === 'db_down' ? 'critical' : 'warning',
    timestamp: new Date().toISOString(),
    ...detalhes
  };

  // Log estruturado (para agregação em Loki/Datadog/etc)
  console.log(JSON.stringify({
    level: alerta.severidade,
    type: 'alerta',
    alerta_tipo: tipo,
    ...detalhes,
    timestamp: alerta.timestamp
  }));

  // Persistir em arquivo (para auditoria)
  try {
    const fs = await import('fs');
    const line = JSON.stringify(alerta) + '\n';
    fs.appendFileSync(ALERTS_FILE, line);
  } catch (err) {
    console.warn('[alerting] erro ao escrever alerta em arquivo:', err.message);
  }

  // Envia para Slack se configurado
  if (SLACK_WEBHOOK_URL) {
    try {
      const emoji = alerta.severidade === 'critical' ? '🚨' : '⚠️';
      const msg = {
        text: `${emoji} Alerta Essência do Cuidar`,
        attachments: [{
          color: alerta.severidade === 'critical' ? 'danger' : 'warning',
          fields: [
            { title: 'Tipo', value: tipo, short: true },
            { title: 'Severidade', value: alerta.severidade, short: true },
            ...Object.entries(detalhes).slice(0, 4).map(([k, v]) => ({
              title: k, value: String(v).slice(0, 200), short: true
            }))
          ],
          ts: Math.floor(now / 1000)
        }]
      };
      await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      });
    } catch (err) {
      console.warn('[alerting] erro ao enviar alerta para Slack:', err.message);
    }
  }

  // TODO: envio de email (requer dep nodemailer)
  // if (ALERT_EMAIL_TO) { ... }

  return alerta;
}

/**
 * Lista alertas recentes (lidos do arquivo ALERTS_FILE).
 * @param {number} limite - max alerts a retornar (default 50)
 * @returns {Promise<Array>}
 */
export async function listarAlertas(limite = 50) {
  try {
    const fs = await import('fs');
    if (!fs.existsSync(ALERTS_FILE)) return [];
    const conteudo = fs.readFileSync(ALERTS_FILE, 'utf-8');
    const linhas = conteudo.trim().split('\n').filter(Boolean);
    return linhas.slice(-limite).map(linha => {
      try { return JSON.parse(linha); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch (err) {
    console.warn('[alerting] erro ao ler alertas:', err.message);
    return [];
  }
}

/**
 * Limpa alertas antigos (mais de 30 dias).
 */
export async function limparAlertasAntigos() {
  try {
    const fs = await import('fs');
    if (!fs.existsSync(ALERTS_FILE)) return { removidos: 0 };
    const conteudo = fs.readFileSync(ALERTS_FILE, 'utf-8');
    const linhas = conteudo.trim().split('\n').filter(Boolean);
    const limite = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const mantidos = [];
    for (const linha of linhas) {
      try {
        const a = JSON.parse(linha);
        const ts = new Date(a.timestamp).getTime();
        if (ts >= limite) mantidos.push(linha);
      } catch { mantidos.push(linha); }
    }
    fs.writeFileSync(ALERTS_FILE, mantidos.join('\n') + (mantidos.length ? '\n' : ''));
    return { removidos: linhas.length - mantidos.length };
  } catch (err) {
    return { removidos: 0, erro: err.message };
  }
}
