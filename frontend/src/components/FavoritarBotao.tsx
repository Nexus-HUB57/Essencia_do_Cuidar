import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

interface Props {
  tipo: 'vaga' | 'profissional';
  id: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  onChange?: (favoritado: boolean) => void;
}

export default function FavoritarBotao({ tipo, id, size = 'md', showLabel = false, onChange }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [favoritado, setFavoritado] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get('/favoritos', { params: { tipo } });
        setFavoritado(data.favoritos.includes(id));
      } catch {}
    })();
  }, [user, tipo, id]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.warning('Entre na sua conta para favoritar');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/favoritos', { tipo, id_recurso: id });
      setFavoritado(data.favoritado);
      onChange?.(data.favoritado);
      if (data.favoritado) {
        toast.success('Salvo!', 'Adicionado aos seus favoritos');
      } else {
        toast.info('Removido dos favoritos');
      }
    } catch (err: any) {
      toast.error('Erro', err?.response?.data?.error || 'Tente novamente');
    } finally {
      setLoading(false);
    }
  }

  const sizeClass = size === 'sm' ? 'text-lg p-1.5' : 'text-xl p-2';
  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`${sizeClass} rounded-full transition-all hover:scale-110 active:scale-95 ${
        favoritado
          ? 'text-rose-500 hover:text-rose-600'
          : 'text-slate-300 hover:text-rose-400'
      } ${loading ? 'opacity-50' : ''}`}
      title={favoritado ? 'Remover dos favoritos' : 'Favoritar'}
      aria-label={favoritado ? 'Remover dos favoritos' : 'Favoritar'}
    >
      {favoritado ? '❤️' : '🤍'}
      {showLabel && (
        <span className="ml-1 text-xs">{favoritado ? 'Favoritado' : 'Favoritar'}</span>
      )}
    </button>
  );
}
