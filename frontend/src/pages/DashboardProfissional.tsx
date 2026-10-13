import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import api from '../utils/api';
import type { Vaga, Candidatura, ProfissionalDetalhes, AvaliacaoPendente } from '../types';
import Chat from '../components/Chat';
import AvaliacaoModal from '../components/AvaliacaoModal';

export default function DashboardProfissional() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'buscar' | 'candidaturas' | 'perfil' | 'avaliacoes'>('buscar');
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [cands, setCands] = useState<Candidatura[]>([]);
  const [detalhes, setDetalhes] = useState<ProfissionalDetalhes | null>(null);
  const [avPendentes, setAvPendentes] = useState<AvaliacaoPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatCom, setChatCom] = useState<{ id: number; nome: string } | null>(null);
  const [avaliar, setAvaliar] = useState<AvaliacaoPendente | null>(null);

  // filtros
  const [fProf, setFProf] = useState('');
  const [fCx,   setFCx]   = useState('');
  const [fReg,  setFReg]  = useState('');

  useEffect(() => { refreshUser(); carregarDetalhes(); }, []);

  useEffect(() => { if (tab === 'buscar') carregarVagas(); }, [tab, fProf, fCx, fReg]);

  useEffect(() => { if (tab === 'candidaturas') carregarCands(); }, [tab]);
  useEffect(() => { if (tab === 'avaliacoes') carregarAvPendentes(); }, [tab]);

  async function carregarDetalhes() {
    try {
      const { data } = await api.get('/auth/me');
      setDetalhes(data.detalhes);
    } catch {}
  }
  async function carregarVagas() {
    setLoading(true);
    try {
      const params: any = {};
      if (fProf) params.profissional = fProf;
      if (fCx)   params.complexidade = fCx;
      if (fReg)  params.regiao = fReg;
      const { data } = await api.get('/vagas', { params });
      setVagas(data.vagas);
    } catch (err) {
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  async function carregarCands() {
    setLoading(true);
    try {
      const { data } = await api.get('/candidaturas/profissional/minhas');
      setCands(data.candidaturas);
    } catch (err) {
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function candidatar(vagaId: number) {
    try {
      await api.post('/candidaturas', { id_vaga: vagaId });
      toast.success('Candidatura enviada! Acompanhe na aba "Minhas candidaturas".');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function carregarAvPendentes() {
    setLoading(true);
    try {
      const { data } = await api.get('/avaliacoes/pendentes');
      setAvPendentes(data.pendentes);
    } catch (err) {
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Olá, {user.nome.split(' ')[0]} 👋</h1>
          <p className="text-slate-500 text-sm">Encontre vagas compatíveis com seu perfil</p>
        </div>
        {detalhes?.diploma_verificado === 1 && (
          <span className="badge-green">✓ Diploma verificado</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {[
          { k: 'buscar', l: '🔍 Buscar vagas' },
          { k: 'candidaturas', l: '📋 Minhas candidaturas' },
          { k: 'avaliacoes', l: `⭐ Avaliações${avPendentes.length ? ` (${avPendentes.length})` : ''}` },
          { k: 'perfil', l: '👤 Meu perfil' }
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === t.k
                ? 'border-serenity-500 text-serenity-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* TAB: BUSCAR */}
      {tab === 'buscar' && (
        <div>
          <div className="card mb-4">
            <div className="grid sm:grid-cols-4 gap-2">
              <input className="input" placeholder="Profissional" value={fProf} onChange={(e) => setFProf(e.target.value)} />
              <select className="input" value={fCx} onChange={(e) => setFCx(e.target.value)}>
                <option value="">Complexidade</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
              </select>
              <input className="input" placeholder="Região" value={fReg} onChange={(e) => setFReg(e.target.value)} />
              <button onClick={carregarVagas} className="btn-primary">Filtrar</button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-slate-400 py-12">Carregando vagas...</p>
          ) : vagas.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              Nenhuma vaga encontrada com esses filtros.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {vagas.map((v) => (
                <div key={v.id} className="card flex flex-col">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold">{v.profissional_desejado}</h3>
                    <span className={v.complexidade === 'media' ? 'badge-amber' : 'badge-green'}>
                      {v.complexidade}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-2 line-clamp-2">{v.servico_descricao}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-3">
                    {v.regiao && <span>📍 {v.regiao}</span>}
                    {v.jornada_horario && <span>🕐 {v.jornada_horario}</span>}
                    {v.remuneracao_valor && (
                      <span className="font-bold text-emerald-600">
                        💰 R$ {v.remuneracao_valor}/{v.remuneracao_tipo === 'hora' ? 'h' : 'plantão'}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link to={`/vagas/${v.id}`} className="btn-ghost flex-1 text-center text-sm">Ver detalhes</Link>
                    <button onClick={() => candidatar(v.id)} className="btn-primary flex-1 text-sm">
                      Candidatar-se
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: CANDIDATURAS */}
      {tab === 'candidaturas' && (
        <div>
          {loading ? (
            <p className="text-center text-slate-400 py-12">Carregando...</p>
          ) : cands.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              Você ainda não se candidatou a nenhuma vaga.
            </div>
          ) : (
            <div className="space-y-3">
              {cands.map((c) => (
                <div key={c.id} className="card flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-semibold">{c.profissional_desejado}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {c.regiao || '—'} • {c.contratante_nome}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Enviada em {new Date(c.criado_em + 'Z').toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status_candidatura === 'pendente' && <span className="badge-amber">Pendente</span>}
                    {c.status_candidatura === 'visualizada' && <span className="badge-blue">Visualizada</span>}
                    {c.status_candidatura === 'aceita' && <span className="badge-green">✓ Aceita</span>}
                    {c.status_candidatura === 'recusada' && <span className="badge-rose">Recusada</span>}
                    {c.status_candidatura === 'aceita' && c.id_contratante && (
                      <button onClick={() => setChatCom({ id: c.id_contratante!, nome: c.contratante_nome || 'Contratante' })}
                        className="btn-ghost text-xs">
                        💬 Chat
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: AVALIAÇÕES PENDENTES */}
      {tab === 'avaliacoes' && (
        <div>
          {loading ? (
            <p className="text-center text-slate-400 py-12">Carregando...</p>
          ) : avPendentes.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <div className="text-4xl mb-2">⭐</div>
              <p>Nenhuma avaliação pendente.</p>
              <p className="text-xs mt-1">Quando uma vaga for encerrada, você poderá avaliar o contratante aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {avPendentes.map((p) => (
                <div key={p.candidatura_id} className="card flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold">{p.profissional_desejado}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {p.regiao || '—'} • Com <strong>{p.outro_nome}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setAvaliar(p)}
                    className="btn-primary text-sm"
                  >
                    ⭐ Avaliar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: PERFIL */}
      {tab === 'perfil' && detalhes && (
        <div className="card max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Resumo do perfil</h2>
            <Link to={`/profissional/${user.id}`} className="btn-ghost text-xs">
              👁️ Ver perfil público
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <div><span className="text-slate-400">Nome:</span> {user.nome}</div>
            <div><span className="text-slate-400">E-mail:</span> {user.email}</div>
            <div><span className="text-slate-400">Telefone:</span> {user.telefone || '—'}</div>
            <div>
              <span className="text-slate-400">Registro:</span>{' '}
              {detalhes.registro_conselho ? `${detalhes.tipo_registro} ${detalhes.registro_conselho}` : '—'}
              {detalhes.registro_verificado === 1 && <span className="badge-green ml-2">Verificado</span>}
            </div>
            <div>
              <span className="text-slate-400">Diploma:</span>{' '}
              {detalhes.diploma_nome_original || 'não enviado'}
              {detalhes.diploma_verificado === 1 && <span className="badge-green ml-2">Verificado</span>}
            </div>
            <div>
              <span className="text-slate-400">Especialidades:</span>{' '}
              {(detalhes.especialidades as string[]).join(', ') || '—'}
            </div>
            <div>
              <span className="text-slate-400">Disponibilidade:</span>{' '}
              {(detalhes.disponibilidade as string[]).join(', ') || '—'}
            </div>
          </div>
        </div>
      )}

      {chatCom && (
        <Chat
          outroId={chatCom.id}
          outroNome={chatCom.nome}
          onClose={() => setChatCom(null)}
        />
      )}

      <AvaliacaoModal
        pendente={avaliar}
        onClose={() => setAvaliar(null)}
        onSuccess={carregarAvPendentes}
      />
    </div>
  );
}
