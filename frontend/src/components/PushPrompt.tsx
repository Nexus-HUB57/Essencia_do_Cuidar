/**
 * Feature 4 — Componente que ativa Web Push.
 * Mostra um botão que pede permissão e registra a subscription no backend.
 * Se VAPID não estiver configurado no backend, fica em no-op.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

const PUBLIC_KEY_CACHE_KEY = 'essencia_push_key';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Obtém o registration do service worker COM TIMEOUT.
 *
 * `navigator.serviceWorker.ready` só resolve quando existe um SW ativo. Se o
 * registro falhar (ex.: /sw.js devolvendo HTML em vez de JS), essa promise
 * fica pendurada PARA SEMPRE — o `await` travava o botão "Ativar push" sem
 * erro e sem retorno ao usuário. Aqui a espera tem prazo e o erro aparece.
 */
async function obterRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_unsupported');

  const existente = await navigator.serviceWorker.getRegistration('/');
  if (existente?.active) return existente;

  const registration = await navigator.serviceWorker.register('/sw.js');

  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('service_worker_timeout')), timeoutMs)
    )
  ]);

  return registration;
}

export default function PushPrompt() {
  const { t } = useTranslation();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    setPermission(Notification.permission);
    (async () => {
      try {
        const { data } = await api.get('/push/key');
        setEnabled(data.enabled);
        if (data.publicKey) localStorage.setItem(PUBLIC_KEY_CACHE_KEY, data.publicKey);
        const reg = await obterRegistration();
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch (e) {
        // Sem SW não há push — mas o resto do app continua funcionando.
        console.warn('[push] service worker indisponível:', e);
      }
    })();
  }, []);

  async function enable() {
    if (!supported) return;
    setErro('');
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setErro(t('notifications.permissionDenied'));
        return;
      }
      const publicKey = localStorage.getItem(PUBLIC_KEY_CACHE_KEY);
      if (!publicKey) {
        // Backend em modo no-op, sem VAPID — apenas informa
        return;
      }
      const reg = await obterRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      await api.post('/push/subscribe', sub);
      setSubscribed(true);
    } catch (e) {
      console.error(e);
      setErro(t('notifications.enablePushError'));
    }
  }

  async function disable() {
    setErro('');
    try {
      const reg = await obterRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error(e);
      setErro(t('notifications.enablePushError'));
    }
  }

  if (!supported) return null;

  if (!enabled) {
    return (
      <div className="text-[11px] text-slate-400 italic">
        {t('notifications.pushNotConfigured')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {erro && <span className="text-rose-500">{erro}</span>}
      {subscribed ? (
        <>
          <span className="text-emerald-600">🔔 {t('notifications.enabled')}</span>
          <button onClick={disable} className="text-slate-400 hover:text-rose-500 underline">
            {t('common.cancel')}
          </button>
        </>
      ) : (
        <button
          onClick={enable}
          className="text-serenity-600 hover:underline"
        >
          🔔 {t('notifications.enablePush')}
        </button>
      )}
    </div>
  );
}
