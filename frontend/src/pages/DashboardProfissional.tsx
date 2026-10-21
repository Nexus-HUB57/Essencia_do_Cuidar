import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import api from '../utils/api';
import type { Vaga, Candidatura, ProfissionalDetalhes, AvaliacaoPendente } from '../types';
import Chat from '../components/Chat';
import AvaliacaoModal from '../components/AvaliacaoModal';
import VerificationBadge, { type VerificationStatus } from '../components/VerificationBadge';

export default function DashboardProfissional() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'buscar' | 'candidaturas' | 'perfil' | 'avaliacoes'>('buscar');
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [cands, setCands] = useState<Candidatura[]>([]);
  const [favoritas, setFavoritas] = useState<Vaga[]>([]);
  const [detalhes, setDetalhes] = useState<ProfissionalDetalhes | null>(null);
  const [avPendentes, setAvPendentes] = useState<AvaliacaoPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatCom, setChatCom] = useState<{ id: number; nome: string } | null>(null);
  const [avaliar, setAvaliar] = useState<AvaliacaoPendente | null>(null);

  // Estado local para a UI de verificação de conselho
  const [verifConselho, setVerifConselho] = useState<string>('');
  const [verifRegistro, setVerifRegistro] = useState<string>('');
  const [verifLogs, setVerifLogs] = useState<Array<{ id: number; conselho: string; registro_conselho: string; resultado_encontrado: number; fonte: string; criado_em: string }>>([]);
  const [verifSubmitting, setVerifSubmitting] = useState(false);

  // filtros
  const [fProf, setFProf] = useState('');
  const [fCx,   setFCx]   = useState('');
  const [fReg,  setFReg]  = useState('');

  useEffect(() => { refreshUser(); carregarDetalhes(); }, []);

  useEffect(() => { if (tab === 'buscar') carregarVagas(); }, [tab, fProf, fCx, fReg]);

  useEffect(() => { if (tab === 'candidaturas') carregarCands(); }, [tab]);
  useEffect(() => { if (tab === 'avaliacoes') carregarAvPendentes(); }, [tab]);

  useEffect(() => { if (tab === 'favoritos') carregarFavoritas(); }, [tab]);

  async function carregarDetalhes() {
    try {
      const { data } = await api.get('/auth/me');
      setDetalhes(data.detalhes);
      if (data.detalhes?.verificacao_status) setVerifConselho(data.detalhes.tipo_registro || '');
      if (data.detalhes?.registro_conselho) setVerifRegistro(data.detalhes.registro_conselho);
    } catch {}
  }

  async function carregarVerificacaoLogs() {
    try {
      const { data } = await api.get('/profissionais/me/verificacao-logs');
      setVerifLogs(data.logs || []);
    } catch {}
  }

  async function triggerVerificacao() {
    if (!verifConselho || !verifRegistro) {
      toast.error(t('verification.triggerFailed'));
      return;
    }
    setVerifSubmitting(true);
    try {
      const { data } = await api.post('/profissionais/me/verificar-registro', {
        conselho: verifConselho,
        registro: verifRegistro
      });
      toast.success(t('verification.triggerSuccess') + ' — ' + (data.observacao || data.status));
      await carregarDetalhes();
      await carregarVerificacaoLogs();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setVerifSubmitting(false);
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
        <button onClick={() => setShowConnect(true)} className="text-xs text-serenity-600 hover:underline">
          💳 Conectar conta de pagamento (Stripe)
        </button>
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
        <div className="space-y-4 max-w-2xl">
          <div className="card">
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

          {/* VERIFICAÇÃO DE CONSELHO */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{t('verification.section')}</h2>
              <VerificationBadge status={detalhes.verificacao_status as VerificationStatus} size="sm" />
            </div>
            <p className="text-sm text-slate-500 mb-4">{t('verification.intro')}</p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{t('verification.conselhoLabel')}</label>
                <select
                  value={verifConselho}
                  onChange={(e) => setVerifConselho(e.target.value)}
                  className="input w-full"
                >
                  <option value="">{t('verification.conselhoPlaceholder')}</option>
                  {(['CRM','COREN','CREFITO','CRP','CRN'] as const).map((c) => (
                    <option key={c} value={c}>{t(`verification.conselhoOptions.${c}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">{t('verification.registroLabel')}</label>
                <input
                  type="text"
                  value={verifRegistro}
                  onChange={(e) => setVerifRegistro(e.target.value)}
                  placeholder={t('verification.registroPlaceholder') as string}
                  className="input w-full"
                />
              </div>
            </div>
            <button
              onClick={triggerVerificacao}
              disabled={verifSubmitting}
              className="btn-primary mt-3"
            >
              {verifSubmitting ? '...' : t('verification.buttonTrigger')}
            </button>

            {detalhes.verificado_em && (
              <div className="text-xs text-slate-400 mt-3">
                {t('verification.lastVerified')}: {new Date(detalhes.verificado_em).toLocaleString()}
              </div>
            )}

            <details className="mt-4" onClick={(e) => { if ((e.target as HTMLElement).tagName === 'SUMMARY') carregarVerificacaoLogs(); }}>
              <summary className="text-sm text-slate-600 cursor-pointer">{t('verification.history')}</summary>
              {verifLogs.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">{t('verification.noHistory')}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {verifLogs.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 text-slate-600">
                      <span>{new Date(l.criado_em).toLocaleString()}</span>
                      <span className="font-mono">{l.conselho} {l.registro_conselho}</span>
                      <span className={l.resultado_encontrado ? 'text-emerald-600' : 'text-amber-600'}>
                        {l.resultado_encontrado ? '✓' : '⏳'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
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
