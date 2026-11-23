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
 * Canais de destino:
 *   - Slack:  SLACK_WEBHOOK_URL (env) — incoming webhook
 *   - Email:  ALERT_EMAIL_TO + SMTP (env) — ver `configurarSmtp()` abaixo
 *
 * O envio de email é opcional e tolerante a falha: se o SMTP não estiver
 * configurado, o alerta é apenas logado; se o envio falhar, o alerta ainda
 * é gravado em arquivo e enviado ao Slack. Um alerta que não sai por email
 * nunca pode derrubar o sistema.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || 'alerts@essenciadocuidar.com.br';
const ALERTS_FILE = process.env.ALERTS_FILE || './data/alerts.log';

let lastAlertTime = {};

/**
 * Transport SMTP a partir das variáveis de ambiente.
 *
 * Dois formatos aceitos:
 *   1. SMTP_URL — URL completa: smtp://user:pass@host:587
 *   2. SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS (com TLS na porta 465)
 *
 * @returns {object|null} configuração do transport, ou null se não houver SMTP
 */
function configurarSmtp() {
  const url = process.env.SMTP_URL;
  if (url) {
    return { url, origem: 'SMTP_URL' };
  }
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const porta = Number(process.env.SMTP_PORT || 587);
  return {
    host,
    porta,
    secure: porta === 465,
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    origem: 'SMTP_HOST'
  };
}

/** O canal de email está configurado? */
export function emailConfigurado() {
  return Boolean(ALERT_EMAIL_TO && configurarSmtp());
}

// O transport é caro de criar (nova conexão TLS), então é reaproveitado.
let transportCache = null;
let transportKey = null;

async function obterTransport(config) {
  const chave = JSON.stringify(config);
  if (transportCache && transportKey === chave) return transportCache;

  const { default: nodemailer } = await import('nodemailer');
  transportCache = config.url
    ? nodemailer.createTransport(config.url)
    : nodemailer.createTransport({
        host: config.host,
        port: config.porta,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined
      });
  transportKey = chave;
  return transportCache;
}

/**
 * Corpo do email em texto puro (fallback para clientes que não leem HTML).
 */
function montarTexto(alerta) {
  const linhas = [
    `Alerta ${alerta.severidade.toUpperCase()} — Essência do Cuidar`,
    '',
    `Tipo:       ${alerta.tipo}`,
    `Severidade: ${alerta.severidade}`,
    `Horário:    ${alerta.timestamp}`,
    ''
  ];
  const extra = Object.entries(alerta)
    .filter(([k]) => !['tipo', 'severidade', 'timestamp'].includes(k));
  if (extra.length) {
    linhas.push('Detalhes:');
    for (const [k, v] of extra) linhas.push(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return linhas.join('\n');
}

/**
 * Corpo do email em HTML.
 */
function montarHtml(alerta) {
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const cor = alerta.severidade === 'critical' ? '#dc2626' : '#f59e0b';
  const extra = Object.entries(alerta)
    .filter(([k]) => !['tipo', 'severidade', 'timestamp'].includes(k));
  const linhas = extra.map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#0f172a;">${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</td></tr>`
  ).join('');
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:${cor};color:#fff;padding:14px 20px;font-weight:600;">
      🚨 Alerta ${esc(alerta.severidade.toUpperCase())} — Essência do Cuidar
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        O alerta <strong>${esc(alerta.tipo)}</strong> foi disparado às ${esc(alerta.timestamp)}.
      </p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;">${linhas}</table>
    </div>
  </div></body></html>`;
}

/**
 * Envia o alerta por email (se SMTP e destinatário estiverem configurados).
 *
 * Nunca lança: uma falha de SMTP é registrada no log, mas o fluxo do alerta
 * continua — o alerta já foi gravado em arquivo e enviado ao Slack.
 *
 * @returns {Promise<boolean>} true se o email foi enviado
 */
async function enviarEmail(alerta) {
  if (!ALERT_EMAIL_TO) return false;
  const config = configurarSmtp();
  if (!config) return false;

  try {
    const transport = await obterTransport(config);
    await transport.sendMail({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO,
      subject: `[Essência do Cuidar] ${alerta.severidade.toUpperCase()}: ${alerta.tipo}`,
      text: montarTexto(alerta),
      html: montarHtml(alerta)
    });
    console.log(`[alerting] email de alerta enviado para ${ALERT_EMAIL_TO} (${alerta.tipo})`);
    return true;
  } catch (err) {
    console.warn('[alerting] erro ao enviar alerta por email:', err.message);
    return false;
  }
}

/**
 * Registra alerta (escreve no log + envia para Slack/Email se configurados).
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

  // Envia por email se configurado
  await enviarEmail(alerta);

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
