/**
 * Cliente para o endpoint https://netlify.ai — simula um webhook de
 * notificação. Falhas são registradas em webhook_logs mas não bloqueiam
 * o fluxo principal (best-effort).
 */
import db from '../db/index.js';

const NETLIFY_AI_URL = process.env.NETLIFY_AI_URL || 'https://netlify.ai';
const TIMEOUT = Number(process.env.NETLIFY_AI_TIMEOUT_MS || 5000);

const insertLog = db.prepare(`
  INSERT INTO webhook_logs (tipo, payload, status_code, resposta, erro)
  VALUES (?, ?, ?, ?, ?)
`);

export async function notifyNetlify(tipo, payload) {
  const body = JSON.stringify({
    event: tipo,
    source: 'essencia-do-cuidar',
    timestamp: new Date().toISOString(),
    data: payload
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(NETLIFY_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    });
    clearTimeout(timer);

    let resposta = '';
    try { resposta = await res.text(); } catch {}

    insertLog.run(tipo, body, res.status, resposta.slice(0, 1000), null);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    const msg = err.name === 'AbortError' ? 'timeout' : err.message;
    insertLog.run(tipo, body, null, null, msg);
    // Em dev, loga mas não derruba o request principal.
    console.warn(`[netlify.ai] ${tipo} falhou: ${msg}`);
    return { ok: false, error: msg };
  }
}
