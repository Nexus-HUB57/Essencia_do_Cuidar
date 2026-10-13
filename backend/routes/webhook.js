import { Router } from 'express';

const router = Router();
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://netlify.ai';

/**
 * Dispara o webhook simulado para o endpoint externo.
 * Falhas são silenciosas (apenas logadas) — não devem quebrar a operação principal.
 */
export async function fireWebhook(event, payload) {
  try {
    const body = {
      event,
      source: 'essencia-do-cuidar',
      timestamp: new Date().toISOString(),
      data: payload,
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    console.log(`[webhook] ${event} -> ${WEBHOOK_URL} status=${res.status}`);
  } catch (e) {
    console.warn(`[webhook] ${event} falhou (silenciado): ${e.message}`);
  }
}

// GET /api/webhook/health  -> checa configuração
router.get('/health', (req, res) => {
  res.json({ webhook_url: WEBHOOK_URL, configured: true });
});

export default router;
