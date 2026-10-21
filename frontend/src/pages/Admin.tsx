import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import api from '../utils/api';

/* ------------------------------------------------------------------ *
 *  Tipos
 * ------------------------------------------------------------------ */

interface Stats {
  totais: {
    usuarios: number;
    profissionais: number;
    contratantes: number;
    admins: number;
    vagas: { total: number; ativas: number; pausadas: number; fechadas: number };
    moderacao: { ok: number; flagged: number; removidas: number };
    profissionais_verificados: number;
    profissionais_pendentes: number;
    candidaturas: number;
    avaliacoes: number;
    mensagens: number;
  };
  vagasPorDia: { dia: string; n: number }[];
  porTipoRegistro: { tipo: string; n: number }[];
}

interface AdminVaga {
  id: number;
  id_contratante: number;
  contratante_nome: string;
  contratante_email: string;
  servico_descricao: string;
  profissional_desejado: string;
  complexidade: 'baixa' | 'media';
  status: 'ativa' | 'pausada' | 'fechada';
  moderacao_status: 'ok' | 'flagged' | 'removida';
  moderacao_motivo: string | null;
  moderado_por_nome: string | null;
  regiao: string | null;
  total_candidatos: number;
  criado_em: string;
}

interface AdminUsuario {
  id: number;
  tipo_usuario: 'profissional' | 'contratante' | 'admin';
  nome: string;
  email: string;
  telefone: string | null;
  criado_em: string;
  registro_conselho: string | null;
  tipo_registro: string | null;
  registro_verificado: 0 | 1 | 2;
  total_vagas: number;
  total_candidaturas: number;
}

interface AcaoModeracao {
  id: number;
  id_vaga: number;
  servico_descricao: string;
  admin_nome: string;
  acao: 'flag' | 'unflag' | 'remove' | 'restore' | 'view';
  motivo: string | null;
  criado_em: string;
}

type Tab = 'overview' | 'vagas' | 'usuarios' | 'moderacao';

/* ------------------------------------------------------------------ *
 *  Componente principal
 * ------------------------------------------------------------------ */

export default function Admin() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [vagas, setVagas] = useState<AdminVaga[]>([]);
  const [usuarios, setUsuarios] = useState<AdminUsuario[]>([]);
  const [acoes, setAcoes] = useState<AcaoModeracao[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [fStatus, setFStatus] = useState<string>('');
  const [fMod, setFMod] = useState<string>('');
  const [fQ, setFQ] = useState<string>('');
  const [fTipo, setFTipo] = useState<string>('');

  useEffect(() => { carregarStats(); }, []);
  useEffect(() => { if (tab === 'vagas') carregarVagas(); }, [tab, fStatus, fMod, fQ]);
  useEffect(() => { if (tab === 'usuarios') carregarUsuarios(); }, [tab, fTipo]);
  useEffect(() => { if (tab === 'moderacao') carregarAcoes(); }, [tab]);

  async function carregarStats() {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function carregarVagas() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fStatus) params.status = fStatus;
      if (fMod) params.moderacao = fMod;
      if (fQ) params.q = fQ;
      const { data } = await api.get('/admin/vagas', { params });
      setVagas(data.vagas);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally { setLoading(false); }
  }

  async function carregarUsuarios() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fTipo) params.tipo = fTipo;
      const { data } = await api.get('/admin/usuarios', { params });
      setUsuarios(data.usuarios);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally { setLoading(false); }
  }

  async function carregarAcoes() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/moderacao', { params: { lim: 100 } });
      setAcoes(data.acoes);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally { setLoading(false); }
  }

  async function acao(vagaId: number, tipo: 'flag' | 'unflag' | 'remove' | 'restore', motivo: string) {
    try {
      await api.post(`/admin/vagas/${vagaId}/${tipo}`, { motivo });
      toast.success(`✓ ${tipo}`);
      carregarVagas();
      carregarStats();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  function pedirMotivo(vagaId: number, tipo: 'flag' | 'unflag' | 'remove' | 'restore', confirmar = false): void {
    const placeholder = t('admin.vagas.motivoPlaceholder');
    const label = t('admin.vagas.motivoLabel');
    const msg = window.prompt(
      `${label} (${tipo})`,
      placeholder
    );
    if (msg == null) return;
    const motivo = (msg || '').trim();
    if (confirmar && !window.confirm(t('admin.vagas.confirmRemove'))) return;
    if (!motivo || motivo.length < 3) {
      toast.error('motivo obrigatório (mín. 3 caracteres)');
      return;
    }
    acao(vagaId, tipo, motivo);
  }

  return (
    <div className="min-h-[80vh] bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
              <p className="text-sm text-slate-500">{t('admin.welcome', { name: user?.nome })} · {t('admin.subtitle')}</p>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto">
          {(['overview', 'vagas', 'usuarios', 'moderacao'] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${
                tab === k
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(`admin.tabs.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'overview' && stats && <Overview stats={stats} />}
        {tab === 'vagas' && (
          <VagasTab
            vagas={vagas}
            loading={loading}
            fStatus={fStatus} setFStatus={setFStatus}
            fMod={fMod} setFMod={setFMod}
            fQ={fQ} setFQ={setFQ}
            onAcao={pedirMotivo}
          />
        )}
        {tab === 'usuarios' && (
          <UsuariosTab
            usuarios={usuarios}
            loading={loading}
            fTipo={fTipo} setFTipo={setFTipo}
          />
        )}
        {tab === 'moderacao' && <ModeracaoTab acoes={acoes} loading={loading} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Aba: Visão geral
 * ------------------------------------------------------------------ */

function Overview({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const s = stats.totais;
  const totalMod = s.moderacao.ok + s.moderacao.flagged + s.moderacao.removida || 1;
  const maxDia = Math.max(1, ...stats.vagasPorDia.map(d => d.n));
  const maxTipo = Math.max(1, ...stats.porTipoRegistro.map(d => d.n));

  return (
    <div className="space-y-6">
      {/* Cards de KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={t('admin.stats.usuariosTotal')} value={s.usuarios} icon="👥" />
        <Kpi label={t('admin.stats.profissionais')} value={s.profissionais} icon="🩺" />
        <Kpi label={t('admin.stats.contratantes')} value={s.contratantes} icon="🏠" />
        <Kpi label={t('admin.stats.vagasAtivas')} value={s.vagas.ativas} icon="📋" />
        <Kpi label={t('admin.stats.candidaturas')} value={s.candidaturas} icon="📨" />
        <Kpi label={t('admin.stats.avaliacoes')} value={s.avaliacoes} icon="⭐" />
        <Kpi label={t('admin.stats.mensagens')} value={s.mensagens} icon="💬" />
        <Kpi label={t('admin.stats.vagasTotal')} value={s.vagas.total} icon="📊" />
      </div>

      {/* Moderação */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-slate-900">{t('admin.stats.moderacao')}</h3>
          <div className="mt-3 space-y-2">
            <Bar label={t('admin.stats.moderacaoOk')}       value={s.moderacao.ok}       total={totalMod} color="bg-emerald-500" />
            <Bar label={t('admin.stats.moderacaoFlagged')} value={s.moderacao.flagged}  total={totalMod} color="bg-amber-500" />
            <Bar label={t('admin.stats.moderacaoRemovida')} value={s.moderacao.removidas} total={totalMod} color="bg-rose-500" />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{t('admin.stats.verificados')}</span><b className="text-emerald-700">{s.profissionais_verificados}</b></div>
            <div className="flex justify-between mt-1"><span className="text-slate-500">{t('admin.stats.pendentes')}</span><b className="text-amber-700">{s.profissionais_pendentes}</b></div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-slate-900">{t('admin.stats.vagasPorDia')}</h3>
          {stats.vagasPorDia.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">—</p>
          ) : (
            <div className="mt-3 flex items-end gap-1 h-32">
              {stats.vagasPorDia.map(d => (
                <div key={d.dia} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.dia}: ${d.n}`}>
                  <div className="w-full bg-amber-400 rounded-t" style={{ height: `${(d.n / maxDia) * 100}%`, minHeight: '4px' }} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{stats.vagasPorDia[0]?.dia?.slice(5) ?? ''}</span>
            <span>{stats.vagasPorDia[stats.vagasPorDia.length - 1]?.dia?.slice(5) ?? ''}</span>
          </div>
        </div>
      </div>

      {/* Profissionais por tipo de registro */}
      <div className="card">
        <h3 className="font-semibold text-slate-900">{t('admin.stats.porTipoRegistro')}</h3>
        <div className="mt-3 space-y-1.5">
          {stats.porTipoRegistro.map(r => (
            <div key={r.tipo} className="flex items-center gap-2 text-sm">
              <span className="w-16 text-slate-500 text-xs">{r.tipo}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                <div className="h-full bg-serenity-500" style={{ width: `${(r.n / maxTipo) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-slate-700">{r.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card flex items-center gap-3">
      <div className="text-3xl">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-slate-500 text-xs">{label}</span>
      <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-slate-700">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Aba: Vagas (com filtros e ações de moderação)
 * ------------------------------------------------------------------ */

function VagasTab({
  vagas, loading, fStatus, setFStatus, fMod, setFMod, fQ, setFQ, onAcao
}: {
  vagas: AdminVaga[];
  loading: boolean;
  fStatus: string; setFStatus: (s: string) => void;
  fMod: string;    setFMod: (s: string) => void;
  fQ: string;      setFQ: (s: string) => void;
  onAcao: (id: number, acao: 'flag' | 'unflag' | 'remove' | 'restore', confirmar?: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold text-slate-900 mb-3">{t('admin.vagas.filters')}</h3>
        <div className="grid sm:grid-cols-4 gap-2">
          <select className="input text-sm" value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">{t('admin.vagas.filterStatus')}: {t('admin.vagas.filterAll')}</option>
            <option value="ativa">{t('admin.vagaAtiva')}</option>
            <option value="pausada">{t('admin.vagaPausada')}</option>
            <option value="fechada">{t('admin.vagaFechada')}</option>
          </select>
          <select className="input text-sm" value={fMod} onChange={e => setFMod(e.target.value)}>
            <option value="">{t('admin.vagas.filterModeracao')}: {t('admin.vagas.filterAll')}</option>
            <option value="ok">{t('admin.vagaOk')}</option>
            <option value="flagged">{t('admin.vagaFlagged')}</option>
            <option value="removida">{t('admin.vagaRemovida')}</option>
          </select>
          <input className="input text-sm sm:col-span-2" placeholder={t('admin.vagas.filterQ')}
                 value={fQ} onChange={e => setFQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-8 text-slate-500">…</div>
      ) : vagas.length === 0 ? (
        <div className="card text-center py-8 text-slate-500">{t('admin.vagas.empty')}</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <Th>{t('admin.vagas.th.id')}</Th>
                <Th>{t('admin.vagas.th.descricao')}</Th>
                <Th>{t('admin.vagas.th.contratante')}</Th>
                <Th>{t('admin.vagas.th.regiao')}</Th>
                <Th>{t('admin.vagas.th.status')}</Th>
                <Th>{t('admin.vagas.th.moderacao')}</Th>
                <Th>{t('admin.vagas.th.candidatos')}</Th>
                <Th className="text-right pr-4">{t('admin.vagas.th.acoes')}</Th>
              </tr>
            </thead>
            <tbody>
              {vagas.map(v => (
                <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <Td><Link to={`/admin/vagas/${v.id}`} className="text-serenity-600 font-medium">#{v.id}</Link></Td>
                  <Td>
                    <div className="max-w-xs">
                      <p className="truncate text-slate-900">{v.servico_descricao}</p>
                      <p className="text-xs text-slate-500">{v.profissional_desejado} · {v.complexidade}</p>
                    </div>
                  </Td>
                  <Td>
                    <p className="text-slate-900">{v.contratante_nome}</p>
                    <p className="text-xs text-slate-500">{v.contratante_email}</p>
                  </Td>
                  <Td><span className="text-slate-600">{v.regiao || t('admin.semRegiao')}</span></Td>
                  <Td><BadgeVagaStatus s={v.status} /></Td>
                  <Td>
                    <BadgeModStatus s={v.moderacao_status} />
                    {v.moderacao_motivo && (
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[160px] truncate" title={v.moderacao_motivo}>
                        {v.moderacao_motivo}
                      </p>
                    )}
                  </Td>
                  <Td><span className="font-mono text-slate-700">{v.total_candidatos}</span></Td>
                  <Td className="text-right pr-4">
                    <div className="flex flex-wrap gap-1 justify-end">
                      <Link to={`/admin/vagas/${v.id}`} className="text-xs text-serenity-600 hover:underline px-1">
                        {t('admin.vagas.view')}
                      </Link>
                      {v.moderacao_status === 'ok' && (
                        <button onClick={() => onAcao(v.id, 'flag')}
                                className="text-xs text-amber-700 hover:underline px-1">
                          {t('admin.vagas.actions.flag')}
                        </button>
                      )}
                      {v.moderacao_status === 'flagged' && (
                        <>
                          <button onClick={() => onAcao(v.id, 'unflag')}
                                  className="text-xs text-emerald-700 hover:underline px-1">
                            {t('admin.vagas.actions.unflag')}
                          </button>
                          <button onClick={() => onAcao(v.id, 'remove', true)}
                                  className="text-xs text-rose-700 hover:underline px-1">
                            {t('admin.vagas.actions.remove')}
                          </button>
                        </>
                      )}
                      {v.moderacao_status === 'removida' && (
                        <button onClick={() => onAcao(v.id, 'restore')}
                                className="text-xs text-emerald-700 hover:underline px-1">
                          {t('admin.vagas.actions.restore')}
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left text-xs font-medium px-4 py-2.5 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>;
}

function BadgeVagaStatus({ s }: { s: 'ativa' | 'pausada' | 'fechada' }) {
  const { t } = useTranslation();
  const map = {
    ativa:   'bg-emerald-100 text-emerald-700',
    pausada: 'bg-amber-100 text-amber-700',
    fechada: 'bg-slate-200 text-slate-600'
  };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${map[s]}`}>{t(`admin.vaga${s[0].toUpperCase() + s.slice(1)}`)}</span>;
}

function BadgeModStatus({ s }: { s: 'ok' | 'flagged' | 'removida' }) {
  const { t } = useTranslation();
  const map = {
    ok:       'bg-emerald-100 text-emerald-700',
    flagged:  'bg-amber-100 text-amber-700',
    removida: 'bg-rose-100 text-rose-700'
  };
  const labels = { ok: t('admin.vagaOk'), flagged: t('admin.vagaFlagged'), removida: t('admin.vagaRemovida') };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${map[s]}`}>{labels[s]}</span>;
}

/* ------------------------------------------------------------------ *
 *  Aba: Usuários
 * ------------------------------------------------------------------ */

function UsuariosTab({
  usuarios, loading, fTipo, setFTipo
}: {
  usuarios: AdminUsuario[];
  loading: boolean;
  fTipo: string; setFTipo: (s: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="card">
        <select className="input text-sm max-w-xs" value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="">{t('admin.usuarios.filterTipo')}: {t('admin.usuarios.todos')}</option>
          <option value="profissional">profissional</option>
          <option value="contratante">contratante</option>
          <option value="admin">admin</option>
        </select>
      </div>

      {loading ? (
        <div className="card text-center py-8 text-slate-500">…</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <Th>{t('admin.usuarios.th.nome')}</Th>
                <Th>{t('admin.usuarios.th.email')}</Th>
                <Th>{t('admin.usuarios.th.tipo')}</Th>
                <Th>{t('admin.usuarios.th.registro')}</Th>
                <Th>{t('admin.usuarios.th.verificado')}</Th>
                <Th>{t('admin.usuarios.th.criado')}</Th>
                <Th>{t('admin.usuarios.th.atividade')}</Th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-t border-slate-100">
                  <Td>{u.nome}</Td>
                  <Td><a href={`mailto:${u.email}`} className="text-serenity-600 hover:underline">{u.email}</a></Td>
                  <Td>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      u.tipo_usuario === 'admin' ? 'bg-amber-100 text-amber-700' :
                      u.tipo_usuario === 'profissional' ? 'bg-serenity-100 text-serenity-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>{u.tipo_usuario}</span>
                  </Td>
                  <Td>
                    {u.registro_conselho ? (
                      <>
                        <span className="font-mono text-xs text-slate-700">{u.registro_conselho}</span>
                        {u.tipo_registro && <span className="ml-1 text-[10px] text-slate-500">({u.tipo_registro})</span>}
                      </>
                    ) : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td><BadgeVerificado v={u.registro_verificado} /></Td>
                  <Td className="text-xs text-slate-500">{new Date(u.criado_em).toLocaleDateString('pt-BR')}</Td>
                  <Td className="text-xs text-slate-600">
                    {u.tipo_usuario === 'contratante' && <span>{u.total_vagas} vagas</span>}
                    {u.tipo_usuario === 'profissional' && <span>{u.total_candidaturas} cands.</span>}
                    {u.tipo_usuario === 'admin' && <span className="text-slate-400">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BadgeVerificado({ v }: { v: 0 | 1 | 2 }) {
  const { t } = useTranslation();
  if (v === 1) return <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">{t('admin.verificado')}</span>;
  if (v === 2) return <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">{t('admin.emAnalise')}</span>;
  return <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-200 text-slate-600">{t('admin.naoVerificado')}</span>;
}

/* ------------------------------------------------------------------ *
 *  Aba: Histórico de moderação
 * ------------------------------------------------------------------ */

function ModeracaoTab({ acoes, loading }: { acoes: AcaoModeracao[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <div>
      {loading ? (
        <div className="card text-center py-8 text-slate-500">…</div>
      ) : acoes.length === 0 ? (
        <div className="card text-center py-8 text-slate-500">—</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <Th>{t('admin.moderacao.th.quando')}</Th>
                <Th>{t('admin.moderacao.th.admin')}</Th>
                <Th>{t('admin.moderacao.th.vaga')}</Th>
                <Th>{t('admin.moderacao.th.acao')}</Th>
                <Th>{t('admin.moderacao.th.motivo')}</Th>
              </tr>
            </thead>
            <tbody>
              {acoes.map(a => (
                <tr key={a.id} className="border-t border-slate-100">
                  <Td className="text-xs text-slate-500 whitespace-nowrap">{new Date(a.criado_em).toLocaleString('pt-BR')}</Td>
                  <Td>{a.admin_nome}</Td>
                  <Td>
                    <Link to={`/admin/vagas/${a.id_vaga}`} className="text-serenity-600 hover:underline">
                      #{a.id_vaga} · {a.servico_descricao.slice(0, 40)}{a.servico_descricao.length > 40 ? '…' : ''}
                    </Link>
                  </Td>
                  <Td><AcaoBadge a={a.acao} /></Td>
                  <Td className="text-xs text-slate-600 max-w-xs">{a.motivo || <span className="text-slate-400">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AcaoBadge({ a }: { a: AcaoModeracao['acao'] }) {
  const map: Record<AcaoModeracao['acao'], string> = {
    flag:    'bg-amber-100 text-amber-700',
    unflag:  'bg-slate-200 text-slate-700',
    remove:  'bg-rose-100 text-rose-700',
    restore: 'bg-emerald-100 text-emerald-700',
    view:    'bg-blue-100 text-blue-700'
  };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${map[a]}`}>{a}</span>;
}
