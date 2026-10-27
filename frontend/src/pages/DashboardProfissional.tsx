import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import api from '../utils/api';
import type { Vaga, Candidatura, ProfissionalDetalhes, MatchingVagasResponse } from '../types';
import Chat from '../components/Chat';
import OnboardingConnectModal from '../components/OnboardingConnectModal';
import { useProfissoes } from '../hooks/useProfissoes';
import {
  SeloScore,
  ListaMotivos,
  CabecalhoRecomendacoes,
  VazioRecomendacoes
} from '../components/Recomendacoes';

const DISPONIBILIDADE_OPCOES = [
  { v: 'manha', l: 'Manhã' },
  { v: 'tarde', l: 'Tarde' },
  { v: 'noite', l: 'Noite' },
  { v: '12h', l: '12h' },
  { v: '24h', l: '24h' }
];

export default function DashboardProfissional() {
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const { rotulo: rotuloProfissao, opcoes: opcoesProfissao } = useProfissoes();
  const [tab, setTab] = useState<'buscar' | 'recomendadas' | 'candidaturas' | 'favoritos' | 'perfil'>('buscar');
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [cands, setCands] = useState<Candidatura[]>([]);
  const [favoritas, setFavoritas] = useState<Vaga[]>([]);
  const [detalhes, setDetalhes] = useState<ProfissionalDetalhes | null>(null);
  const [recomendadas, setRecomendadas] = useState<MatchingVagasResponse['recomendacoes']>([]);
  const [loading, setLoading] = useState(false);
  const [chatCom, setChatCom] = useState<{ id: number; nome: string } | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  // Edição do perfil (dados que alimentam o matching)
  const [formPerfil, setFormPerfil] = useState({
    profissao: '',
    regiao: '',
    disponibilidade: [] as string[]
  });
  const [salvando, setSalvando] = useState(false);
  const [perfilSalvo, setPerfilSalvo] = useState(false);
  const [perfilErro, setPerfilErro] = useState('');

  // filtros
  const [fProf, setFProf] = useState('');
  const [fCx,   setFCx]   = useState('');
  const [fReg,  setFReg]  = useState('');

  useEffect(() => { refreshUser(); carregarDetalhes(); }, []);

  useEffect(() => { if (tab === 'buscar') carregarVagas(); }, [tab, fProf, fCx, fReg]);

  useEffect(() => { if (tab === 'recomendadas') carregarRecomendadas(); }, [tab]);

  useEffect(() => { if (tab === 'candidaturas') carregarCands(); }, [tab]);

  useEffect(() => { if (tab === 'favoritos') carregarFavoritas(); }, [tab]);

  async function carregarDetalhes() {
    try {
      const { data } = await api.get('/auth/me');
      setDetalhes(data.detalhes);
      setFormPerfil({
        profissao: data.detalhes?.profissao || '',
        regiao: data.detalhes?.regiao || '',
        disponibilidade: data.detalhes?.disponibilidade || []
      });
    } catch {}
  }

  /** Salva os dados que alimentam o matching (profissão, região, disponibilidade). */
  async function salvarPerfil() {
    setSalvando(true);
    setPerfilSalvo(false);
    setPerfilErro('');
    try {
      const { data } = await api.put('/profissionais/me', {
        profissao: formPerfil.profissao || undefined,
        regiao: formPerfil.regiao || undefined,
        disponibilidade: formPerfil.disponibilidade
      });
      setDetalhes(data.detalhes);
      setPerfilSalvo(true);
      // Recarrega as recomendações — o perfil acabou de mudar.
      if (tab === 'recomendadas') carregarRecomendadas();
    } catch (err) {
      setPerfilErro(getErrorMessage(err));
    } finally {
      setSalvando(false);
    }
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
  async function carregarRecomendadas() {
    setLoading(true);
    try {
      const { data } = await api.get('/profissionais/me/recomendar');
      setRecomendadas(data.recomendacoes || []);
    } catch (err) {
      console.error(getErrorMessage(err));
      setRecomendadas([]);
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
  async function carregarFavoritas() {
    setLoading(true);
    try {
      const { data } = await api.get('/favoritos/vagas');
      setFavoritas(data.vagas);
    } catch (err) {
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function candidatar(vagaId: number) {
    try {
      await api.post('/candidaturas', { id_vaga: vagaId });
      alert('Candidatura enviada! Acompanhe na aba "Minhas candidaturas".');
      // A vaga sai da lista de recomendações (o backend não recomenda quem
      // já se candidatou) — recarrega para manter a UI consistente.
      if (tab === 'recomendadas') carregarRecomendadas();
    } catch (err) {
      alert(getErrorMessage(err));
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
        <button onClick={() => setShowConnect(true)} className="text-xs text-serenity-600 hover:underline">
          💳 Conectar conta de pagamento (Stripe)
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {[
          { k: 'buscar', l: '🔍 Buscar vagas' },
          { k: 'recomendadas', l: '✨ Recomendadas' },
          { k: 'candidaturas', l: '📋 Minhas candidaturas' },
          { k: 'favoritos', l: '❤️ Favoritas' },
          { k: 'perfil', l: '👤 Meu perfil' }
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
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

      {/* TAB: RECOMENDADAS (matching automático) */}
      {tab === 'recomendadas' && (
        <div>
          <div className="card mb-4">
            <CabecalhoRecomendacoes
              titulo={t('matching.recommendedVagas')}
              subtitulo={t('matching.subtitle')}
              total={recomendadas.length}
            />
            {!detalhes?.profissao && (
              <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                💡 {t('matching.perfil.completeProfile')}
              </p>
            )}
          </div>

          {loading ? (
            <p className="text-center text-slate-400 py-12">{t('matching.loading')}</p>
          ) : recomendadas.length === 0 ? (
            <div className="card">
              <VazioRecomendacoes
                mensagem={t('matching.noRecommendations')}
                dica={t('matching.noRecommendationsHint')}
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {recomendadas.map((r) => {
                const v = r.vaga;
                return (
                  <div key={v.id} className="card flex flex-col">
                    <div className="flex items-start gap-3">
                      <SeloScore score={r.score} nivel={r.nivel} />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{v.profissional_desejado}</h3>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{v.servico_descricao}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-3">
                      {v.regiao && <span>📍 {v.regiao}</span>}
                      {v.jornada_horario && <span>🕐 {v.jornada_horario}</span>}
                      {v.remuneracao_valor && (
                        <span className="font-bold text-emerald-600">
                          💰 R$ {v.remuneracao_valor}/{v.remuneracao_tipo === 'hora' ? 'h' : 'plantão'}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] uppercase tracking-wide text-slate-400 mt-3">{t('matching.why')}</p>
                    <ListaMotivos motivos={r.motivosDetalhados} />

                    <div className="mt-auto pt-3 flex gap-2">
                      <Link to={`/vagas/${v.id}`} className="btn-ghost flex-1 text-center text-sm">
                        {t('matching.viewVaga')}
                      </Link>
                      <button onClick={() => candidatar(v.id)} className="btn-primary flex-1 text-sm">
                        {t('matching.apply')}
                      </button>
                    </div>
                  </div>
                );
              })}
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

      {/* TAB: FAVORITOS */}
      {tab === 'favoritos' && (
        <div>
          {loading ? (
            <p className="text-center text-slate-400 py-12">Carregando...</p>
          ) : favoritas.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              Você ainda não favoritou nenhuma vaga. Clique no 🤍 em uma vaga para salvar.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {favoritas.map((v) => (
                <div key={v.id} className="card flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{v.profissional_desejado}</h3>
                    <span className={v.complexidade === 'media' ? 'badge-amber' : 'badge-green'}>
                      {v.complexidade}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2 mt-1">{v.servico_descricao}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-2">
                    {v.regiao && <span>📍 {v.regiao}</span>}
                    {v.remuneracao_valor && (
                      <span className="font-semibold text-emerald-600">
                        💰 R$ {v.remuneracao_valor}/{v.remuneracao_tipo === 'hora' ? 'h' : 'plantão'}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto pt-3 flex gap-2">
                    <Link to={`/vagas/${v.id}`} className="btn-ghost flex-1 text-center text-sm">Ver</Link>
                    <button onClick={() => candidatar(v.id)} className="btn-primary flex-1 text-sm">Candidatar</button>
                  </div>
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
              <span className="text-slate-400">{t('matching.perfil.profissao')}:</span>{' '}
              {detalhes.profissao ? rotuloProfissao(detalhes.profissao) : '—'}
            </div>
            <div>
              <span className="text-slate-400">{t('matching.perfil.regiao')}:</span>{' '}
              {detalhes.regiao || '—'}
            </div>
            <div>
              <span className="text-slate-400">Disponibilidade:</span>{' '}
              {(detalhes.disponibilidade as string[]).join(', ') || '—'}
            </div>
          </div>

          {/* Edição dos dados que alimentam o matching */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-sm mb-1">{t('matching.perfil.completeProfile')}</h3>
            <p className="text-xs text-slate-400 mb-3">{t('matching.noRecommendationsHint')}</p>

            <div className="space-y-3">
              <div>
                <label className="label">{t('matching.perfil.profissao')}</label>
                <select
                  className="input"
                  value={formPerfil.profissao}
                  onChange={(e) => setFormPerfil({ ...formPerfil, profissao: e.target.value })}
                >
                  <option value="">{t('matching.perfil.selectProfissao')}</option>
                  {opcoesProfissao.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">{t('matching.perfil.regiao')}</label>
                <input
                  className="input"
                  value={formPerfil.regiao}
                  onChange={(e) => setFormPerfil({ ...formPerfil, regiao: e.target.value })}
                  placeholder={t('matching.perfil.regiaoPlaceholder')}
                />
              </div>

              <div>
                <label className="label">Disponibilidade</label>
                <div className="flex flex-wrap gap-1.5">
                  {DISPONIBILIDADE_OPCOES.map((d) => {
                    const ativo = formPerfil.disponibilidade.includes(d.v);
                    return (
                      <button
                        key={d.v}
                        type="button"
                        onClick={() => setFormPerfil({
                          ...formPerfil,
                          disponibilidade: ativo
                            ? formPerfil.disponibilidade.filter((x) => x !== d.v)
                            : [...formPerfil.disponibilidade, d.v]
                        })}
                        className={`px-3 py-1 rounded-full text-xs border ${
                          ativo
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {d.l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button onClick={salvarPerfil} disabled={salvando} className="btn-primary text-sm">
                  {salvando ? t('common.loading') : t('perfil.save')}
                </button>
                {perfilSalvo && <span className="text-xs text-emerald-600">✓ Salvo</span>}
                {perfilErro && <span className="text-xs text-rose-600">{perfilErro}</span>}
              </div>
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
      {showConnect && <OnboardingConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}
