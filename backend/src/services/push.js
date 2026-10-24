/**
 * Feature 4 — Web Push (VAPID) para notificar profissionais/contratantes
 * sobre novas mensagens, candidaturas, etc.
 *
 * Funciona em PWA sem precisar de FCM/Google services — usa o push nativo
 * do browser via web-push + VAPID keys.
 *
 * Para gerar chaves VAPID em produção:
 *   npx web-push generate-vapid-keys
 *
 * Sem chaves configuradas, o módulo roda em modo "no-op" (não faz nada).
 */
import webpush from 'web-push';
import db from '../db/driver.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@essencia-do-cuidar.app';

let enabled = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  enabled = true;
  console.log('[push] VAPID configurado — web push ativo');
} else {
  console.log('[push] VAPID não configurado — push desabilitado (no-op)');
}

export function isEnabled() { return enabled; }
export function getPublicKey() { return VAPID_PUBLIC || null; }

/**
 * Salva/atualiza uma subscription do user.
 */
export async function saveSubscription(userId, subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Subscription inválida');
  }
  // Upsert
  const existing = await db.get('SELECT id FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
  if (existing) {
    await db.run(
      'UPDATE push_subscriptions SET id_user = ?, p256dh = ?, auth = ? WHERE endpoint = ?',
      [userId, subscription.keys.p256dh, subscription.keys.auth, subscription.endpoint]
    );
  } else {
    await db.run(
      'INSERT INTO push_subscriptions (id_user, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
  }
}

export async function removeSubscription(userId, endpoint) {
  await db.run('DELETE FROM push_subscriptions WHERE id_user = ? AND endpoint = ?', [userId, endpoint]);
}

/**
 * Envia notificação para todas as subscriptions ativas de um user.
 * Best-effort: falhas individuais são silenciadas e a subscription é removida
 * se estiver expirada (410 Gone ou 404).
 */
export async function notifyUser(userId, payload) {
  if (!enabled) return { sent: 0, skipped: true };
  const subs = await db.all('SELECT * FROM push_subscriptions WHERE id_user = ?', [userId]);
  if (!subs.length) return { sent: 0 };

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription morreu — limpa
        await db.run('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
      }
    }
  }
  return { sent };
}
