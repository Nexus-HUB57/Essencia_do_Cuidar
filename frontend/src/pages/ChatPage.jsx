import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from '../components/UI.jsx';

export default function ChatPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [vaga, setVaga] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const bottomRef = useRef(null);

  async function load(initial = false) {
    if (initial) setLoading(true);
    try {
      const [v, m] = await Promise.all([api.getVaga(id), api.getMensagens(id)]);
      setVaga(v); setMsgs(m);
    } catch (e) { setErro(e.message); }
    finally { if (initial) setLoading(false); }
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  // Polling simples (a cada 5s) — em produção trocar por SSE/WebSocket
  useEffect(() => {
    const t = setInterval(() => { if (!loading) load(false); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [id, loading]);

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    const corpo = texto.trim();
    setTexto('');
    try {
      const m = await api.enviarMensagem(Number(id), corpo);
      setMsgs(arr => [...arr, m]);
    } catch (e2) { setErro(e2.message); }
  }

  if (loading) return <div className="container-page py-16 text-center"><Spinner /></div>;
  if (erro) return <div className="container-page py-16 text-center text-rose-600">{erro}</div>;
  if (!vaga) return null;

  return (
    <section className="container-page py-6 sm:py-10">
      <Link to={user.tipo_usuario === 'contratante' ? `/vagas/${vaga.id}/candidatos` : `/vagas/${vaga.id}`} className="text-sm text-brand-blue">← Voltar</Link>
      <h1 className="mt-3 text-2xl font-semibold">Chat — {vaga.profissional_desejado || 'Vaga'}</h1>
      <p className="text-sm text-brand-slate">Negociação entre {user.tipo_usuario === 'contratante' ? 'contratante' : 'profissional'} e candidatos.</p>

      <div className="mt-4 card max-w-2xl mx-auto p-0 overflow-hidden">
        <div className="h-[60vh] overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 && <p className="text-center text-sm text-brand-slate py-8">Nenhuma mensagem ainda. Comece a conversa.</p>}
          {msgs.map(m => {
            const isMe = m.id_remetente === user.id;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${isMe ? 'bg-brand-blue text-white' : 'bg-slate-100 text-brand-ink'}`}>
                  {!isMe && <p className="text-[11px] opacity-70 mb-0.5">{m.remetente_nome} · {m.remetente_tipo}</p>}
                  <p className="whitespace-pre-line">{m.corpo}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-white/70' : 'text-brand-slate'}`}>{new Date(m.criado_em).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={enviar} className="border-t border-slate-100 p-3 flex gap-2">
          <input className="input" placeholder="Escreva uma mensagem…" value={texto} onChange={e => setTexto(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={!texto.trim()}>Enviar</button>
        </form>
      </div>
    </section>
  );
}
