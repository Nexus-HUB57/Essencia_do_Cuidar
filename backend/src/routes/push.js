/**
 * Feature 4 — Web Push subscription management.
 *
 *   GET  /api/push/key          → retorna a VAPID public key (frontend precisa para subscrever)
 *   POST /api/push/subscribe    → registra subscription do user
 *   POST /api/push/unsubscribe  → remove subscription
 */
import express from 'express';
import { createRouter } from '../middleware/async.js';
import { authRequired } from '../middleware/auth.js';
import { saveSubscription, removeSubscription, getPublicKey, isEnabled } from '../services/push.js';

const router = createRouter(express);

router.get('/key', (req, res) => {
  res.json({ enabled: isEnabled(), publicKey: getPublicKey() });
});

router.post('/subscribe', authRequired, async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ error: 'Subscription inválida' });
  await saveSubscription(req.user.id, sub);
  res.json({ ok: true });
});

router.post('/unsubscribe', authRequired, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint obrigatório' });
  await removeSubscription(req.user.id, endpoint);
  res.json({ ok: true });
});

export default router;
