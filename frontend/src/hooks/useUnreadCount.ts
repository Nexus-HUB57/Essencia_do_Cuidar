import { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

/**
 * Hook que retorna o número de mensagens não lidas para o user logado.
 * Polling a cada 20s (leve) + invalidação no evento custom 'essencia:refresh-unread'
 * (que pode ser disparado pelo Chat quando uma nova mensagem chega).
 */
export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const { data } = await api.get('/mensagens');
        const total = (data.conversas || []).reduce(
          (acc: number, c: { nao_lidas: number }) => acc + (c.nao_lidas || 0),
          0
        );
        if (!cancelled) setCount(total);
      } catch {
        // silencioso — não incomoda o user com erro de polling
      }
    }

    load();
    const t = setInterval(load, 20000);
    const onRefresh = () => load();
    window.addEventListener('essencia:refresh-unread', onRefresh);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('essencia:refresh-unread', onRefresh);
    };
  }, [user]);

  return count;
}
