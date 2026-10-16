import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

interface Notif {
  tipo: 'mensagem' | 'candidatura' | 'resposta_candidatura';
  id: number;
  titulo: string;
  preview: string;
  de?: number;
  vaga_id?: number;
  criado_em: string;
}

function tempoRelativo(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('pt-BR');
}

export default function SinoNotificacoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Polling leve a cada 30s
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    const carregar = async () => {
      try {
        const { data } = await api.get('/notificacoes/contador');
        if (!cancelado) setNaoLidas(data.nao_lidas || 0);
      } catch {}
    };
    carregar();
    const t = setInterval(carregar, 30000);
    return () => { cancelado = true; clearInterval(t); };
  }, [user]);

  // Fecha ao clicar fora
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function abrir() {
    setAberto((a) => !a);
    if (!aberto && user) {
      setLoading(true);
      try {
        const { data } = await api.get('/notificacoes');
        setItems(data.items || []);
        setNaoLidas(data.nao_lidas || 0);
        // Marca mensagens como lidas após abrir
        await api.post('/notificacoes/marcar-lidas').catch(() => {});
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  }

  function irPara(item: Notif) {
    setAberto(false);
    if (item.tipo === 'mensagem') {
      const dest = user?.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante';
      navigate(dest);
    } else if (item.vaga_id) {
      if (user?.tipo_usuario === 'contratante') navigate('/dashboard/contratante');
      else navigate(`/vagas/${item.vaga_id}`);
    }
  }

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={abrir}
        className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        aria-label="Notificações"
      >
        🔔
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-200 dark:border-slate-700 z-40 fade-in">
          <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notificações</h3>
            {naoLidas > 0 && (
              <span className="text-xs text-rose-500 font-semibold">{naoLidas} novas</span>
            )}
          </div>
          {loading ? (
            <p className="text-center text-slate-400 text-sm py-8">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">Nenhuma notificação.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {items.map((item) => (
                <li
                  key={`${item.tipo}-${item.id}`}
                  onClick={() => irPara(item)}
                  className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base shrink-0 mt-0.5">
                      {item.tipo === 'mensagem' && '💬'}
                      {item.tipo === 'candidatura' && '📥'}
                      {item.tipo === 'resposta_candidatura' && '✨'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.titulo}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">{item.preview}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{tempoRelativo(item.criado_em)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="p-2 border-t border-slate-100 dark:border-slate-700 text-center">
            <button
              onClick={() => {
                setAberto(false);
                navigate(user.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante');
              }}
              className="text-xs text-serenity-600 dark:text-serenity-300 hover:underline"
            >
              Ver todas →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
