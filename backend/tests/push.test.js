import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, auth } from './helpers.js';
import db from '../src/db/driver.js';

describe('serviço de push (web-push / VAPID)', () => {
  beforeEach(async () => { await resetDb(); });

  it('isEnabled() é false sem chaves VAPID', async () => {
    const push = await import('../src/services/push.js');
    expect(push.isEnabled()).toBe(false);
    expect(push.getPublicKey()).toBeNull();
  });

  it('notifyUser sem VAPID é no-op (não lança)', async () => {
    const push = await import('../src/services/push.js');
    const u = await createUser();
    await expect(push.notifyUser(u.id, { title: 'oi' })).resolves.not.toThrow();
  });
});

describe('GET /api/push/key', () => {
  beforeEach(async () => { await resetDb(); });

  it('devolve enabled=false e publicKey null sem VAPID', async () => {
    const r = await (await api()).get('/api/push/key');
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(false);
    expect(r.body.publicKey).toBeNull();
  });
});

describe('POST /api/push/subscribe', () => {
  beforeEach(async () => { await resetDb(); });

  it('registra a subscription do usuário', async () => {
    const u = await createUser();
    const r = await (await api()).post('/api/push/subscribe').set(auth(u.token)).send({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'pubkey', auth: 'authkey' }
    });
    expect(r.status).toBe(200);
    const row = await db.get('SELECT * FROM push_subscriptions WHERE id_user = ?', [u.id]);
    expect(row).toBeTruthy();
    expect(row.endpoint).toBe('https://push.example.com/abc');
  });

  it('exige autenticação (401)', async () => {
    const r = await (await api()).post('/api/push/subscribe').send({ endpoint: 'x' });
    expect(r.status).toBe(401);
  });

  it('rejeita subscription sem endpoint (400)', async () => {
    const u = await createUser();
    const r = await (await api()).post('/api/push/subscribe').set(auth(u.token)).send({ keys: {} });
    expect(r.status).toBe(400);
  });

  it('não duplica a mesma subscription (upsert)', async () => {
    const u = await createUser();
    const body = { endpoint: 'https://push.example.com/dup', keys: { p256dh: 'k', auth: 'a' } };
    await (await api()).post('/api/push/subscribe').set(auth(u.token)).send(body);
    await (await api()).post('/api/push/subscribe').set(auth(u.token)).send(body);
    const rows = await db.all('SELECT * FROM push_subscriptions WHERE id_user = ?', [u.id]);
    expect(rows.length).toBe(1);
  });
});

describe('POST /api/push/unsubscribe', () => {
  beforeEach(async () => { await resetDb(); });

  it('remove a subscription', async () => {
    const u = await createUser();
    await (await api()).post('/api/push/subscribe').set(auth(u.token)).send({
      endpoint: 'https://push.example.com/x', keys: { p256dh: 'k', auth: 'a' }
    });
    const r = await (await api()).post('/api/push/unsubscribe').set(auth(u.token)).send({
      endpoint: 'https://push.example.com/x'
    });
    expect(r.status).toBe(200);
    const rows = await db.all('SELECT * FROM push_subscriptions WHERE id_user = ?', [u.id]);
    expect(rows.length).toBe(0);
  });

  it('exige endpoint (400)', async () => {
    const u = await createUser();
    const r = await (await api()).post('/api/push/unsubscribe').set(auth(u.token)).send({});
    expect(r.status).toBe(400);
  });
});
