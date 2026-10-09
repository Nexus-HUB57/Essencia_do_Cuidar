import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import type { Mensagem } from '../types';

interface Props {
  outroId: number;
  outroNome: string;
  onClose: () => void;
}

export default function Chat({ outroId, outroNome, onClose }: Props) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('essencia_token');
    if (!token) return;
    const s = io('/', { auth: { token } });
    setSocket(s);
    s.on('mensagem:nova', (m: Mensagem) => {
      // Só atualiza se a mensagem é entre este user e o outro
      if (
        (m.id_remetente === outroId && m.id_destinatario === user?.id) ||
        (m.id_remetente === user?.id && m.id_destinatario === outroId)
      ) {
        setMsgs((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      }
    });
    return () => { s.disconnect(); };
  }, [outroId, user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/mensagens/${outroId}`);
        setMsgs(data.mensagens);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [outroId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    try {
      const { data } = await api.post('/mensagens', { id_destinatario: outroId, conteudo: t });
      setMsgs((prev) => prev.some((x) => x.id === data.mensagem.id) ? prev : [...prev, data.mensagem]);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-card w-full sm:max-w-md h-[80vh] sm:h-[600px] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-serenity-400 to-emerald-400 text-white flex items-center justify-center font-semibold">
              {outroNome[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm">{outroNome}</p>
              <p className="text-[10px] text-emerald-600">● online</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {msgs.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">Nenhuma mensagem ainda. Comece a conversa!</p>
          ) : msgs.map((m) => {
            const minha = m.id_remetente === user?.id;
            return (
              <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                  minha ? 'bg-serenity-500 text-white' : 'bg-slate-100 text-slate-800'
                }`}>
                  <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                  <p className={`text-[10px] mt-1 ${minha ? 'text-white/70' : 'text-slate-400'}`}>
                    {new Date(m.criado_em + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); enviar(); }}
          className="border-t border-slate-100 p-3 flex gap-2"
        >
          <input
            className="input flex-1"
            placeholder="Digite uma mensagem..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="btn-primary px-4">Enviar</button>
        </form>
      </div>
    </div>
  );
}
