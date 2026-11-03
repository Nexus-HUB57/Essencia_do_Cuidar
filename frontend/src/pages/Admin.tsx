/**
 * Feature 5 — Painel administrativo.
 * Tabs: stats, users, vagas, verificações, pagamentos, webhooks.
 * Acessível apenas para usuários com is_admin = true.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import api from '../utils/api';
import { Navigate } from 'react-router-dom';

interface Stats {
  users: number;
  profissionais: number;
  contratantes: number;
  vagas_ativas: number;
  candidaturas: number;
  mensagens: number;
  receita_total_centavos: number;
  pagamentos_realizados: number;
  reports_abertos: number;
  verificacoes_pendentes: number;
}
interface AdminUser {
  id: number; nome: string; email: string; tipo_usuario: string;
  telefone: string | null; is_admin: number; suspended_at: string | null;
  criado_em: string;
}
interface Vaga {
  id: number; contratante_nome: string; contratante_email: string;
  profissional_desejado: string; regiao: string; complexidade: string;
  status: string; criado_em: string;
}
interface Verificacao {
  id: number; profissional_nome: string; profissional_email: string;
  diploma_url: string | null; tipo_registro: string; numero_registro: string;
  uf: string | null; status: string; motivo: string | null; criado_em: string;
}
interface Pagamento {
  id: number; contratante_nome: string; profissional_nome: string;
  valor_centavos: number; metodo: string; status: string; criado_em: string;
}

const BRL = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

export default function Admin() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'stats' | 'users' | 'vagas' | 'verificacoes' | 'pagamentos' | 'webhooks'>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [verificacoes, setVerificacoes] = useState<Verificacao[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.is_admin) return;
    if (tab === 'stats') loadStats();
    if (tab === 'users') loadUsers();
    if (tab === 'vagas') loadVagas();
    if (tab === 'verificacoes') loadVerificacoes();
    if (tab === 'pagamentos') loadPagamentos();
    if (tab === 'webhooks') loadWebhooks();
  }, [tab, user?.is_admin]);

  if (user && !user.is_admin) {
    return <Navigate to="/" replace />;
  }

  async function loadStats() {
    setLoading(true);
    try { const { data } = await api.get('/admin/stats'); setStats(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  async function loadUsers() {
    setLoading(true);
    try { const { data } = await api.get('/admin/users'); setUsers(data.users); }
    finally { setLoading(false); }
  }
  async function loadVagas() {
    setLoading(true);
    try { const { data } = await api.get('/admin/vagas'); setVagas(data.vagas); }
    finally { setLoading(false); }
  }
  async function loadVerificacoes() {
    setLoading(true);
    try { const { data } = await api.get('/admin/verificacoes?status=pendente'); setVerificacoes(data.verificacoes); }
    finally { setLoading(false); }
  }
  async function loadPagamentos() {
    setLoading(true);
    try { const { data } = await api.get('/admin/pagamentos'); setPagamentos(data.pagamentos); }
    finally { setLoading(false); }
  }
  async function loadWebhooks() {
    setLoading(true);
    try { const { data } = await api.get('/admin/webhooks'); setWebhooks(data.webhooks); }
    finally { setLoading(false); }
  }

  async function toggleSuspend(u: AdminUser) {
    const suspended = !u.suspended_at;
    const motivo = suspended ? prompt('Motivo da suspensão?') : null;
    if (suspended && !motivo) return;
    try {
      await api.patch(`/admin/users/${u.id}`, { suspended, motivo });
      loadUsers();
    } catch (e) { alert(getErrorMessage(e)); }
  }
  async function toggleAdmin(u: AdminUser) {
    if (!confirm(u.is_admin ? 'Remover privilégios de admin?' : 'Promover a admin?')) return;
    try {
      await api.post(`/admin/users/${u.id}/admin`, { is_admin: !u.is_admin });
      loadUsers();
    } catch (e) { alert(getErrorMessage(e)); }
  }
  async function moderateVaga(id: number, status: string) {
    try {
      await api.patch(`/admin/vagas/${id}`, { status });
      loadVagas();
    } catch (e) { alert(getErrorMessage(e)); }
  }
  async function decideVerificacao(v: Verificacao, status: 'aprovado' | 'rejeitado') {
    const motivo = status === 'rejeitado' ? prompt('Motivo da rejeição?') : null;
    if (status === 'rejeitado' && !motivo) return;
    try {
      await api.patch(`/admin/verificacoes/${v.id}`, { status, motivo });
      loadVerificacoes();
    } catch (e) { alert(getErrorMessage(e)); }
  }

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
          <p className="text-slate-500 text-sm">Olá, {user.nome.split(' ')[0]} 👋</p>
        </div>
        <div className="text-xs text-slate-400">admin@demo.com / admin1234</div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {[
          { k: 'stats', l: '📊 Stats' },
          { k: 'users', l: `👥 ${t('admin.users')}` },
          { k: 'vagas', l: `📋 ${t('admin.vagas')}` },
          { k: 'verificacoes', l: `✅ ${t('admin.verificacoes')}` },
          { k: 'pagamentos', l: `💰 ${t('admin.pagamentos')}` },
          { k: 'webhooks', l: `🔗 ${t('admin.webhooks')}` }
        ].map((x) => (
          <button key={x.k} onClick={() => setTab(x.k as any)}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              tab === x.k ? 'border-serenity-500 text-serenity-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {x.l}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-slate-400 py-12">{t('common.loading')}</p>}

      {!loading && tab === 'stats' && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { l: t('admin.totalUsers'), v: stats.users, sub: `${stats.profissionais} prof • ${stats.contratantes} contrat` },
            { l: t('admin.vagasAtivas'), v: stats.vagas_ativas },
            { l: t('admin.candidaturas'), v: stats.candidaturas },
            { l: t('admin.receitaTotal'), v: BRL(stats.receita_total_centavos), sub: `${stats.pagamentos_realizados} pagos` },
            { l: t('admin.verificacoesPendentes'), v: stats.verificacoes_pendentes }
          ].map((c, i) => (
            <div key={i} className="card">
              <p className="text-xs text-slate-500">{c.l}</p>
              <p className="text-2xl font-bold text-serenity-600 mt-1">{c.v}</p>
              {c.sub && <p className="text-[10px] text-slate-400 mt-1">{c.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'users' && (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-sm">{u.nome} {u.is_admin ? <span className="badge-amber text-[10px] ml-1">admin</span> : null}</p>
                <p className="text-xs text-slate-500">{u.email} • {u.tipo_usuario} • {new Date(u.criado_em + 'Z').toLocaleDateString('pt-BR')}</p>
                {u.suspended_at && <p className="text-[10px] text-rose-500 mt-1">⚠️ Suspenso desde {new Date(u.suspended_at + 'Z').toLocaleDateString('pt-BR')}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleSuspend(u)}
                  className={`text-xs px-2 py-1 rounded ${u.suspended_at ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {u.suspended_at ? t('admin.unsuspend') : t('admin.suspend')}
                </button>
                <button onClick={() => toggleAdmin(u)}
                  className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  {u.is_admin ? 'Demote' : 'Promote'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'vagas' && (
        <div className="space-y-2">
          {vagas.map((v) => (
            <div key={v.id} className="card flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-sm">{v.profissional_desejado} <span className="text-xs text-slate-400">— {v.contratante_nome}</span></p>
                <p className="text-xs text-slate-500">{v.regiao || '—'} • {v.complexidade} • {new Date(v.criado_em + 'Z').toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={v.status === 'ativa' ? 'badge-green' : v.status === 'pausada' ? 'badge-amber' : 'badge-slate'}>{v.status}</span>
                {v.status !== 'fechada' && (
                  <button onClick={() => moderateVaga(v.id, 'fechada')}
                    className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-700">
                    Fechar
                  </button>
                )}
                {v.status === 'fechada' && (
                  <button onClick={() => moderateVaga(v.id, 'ativa')}
                    className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700">
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'verificacoes' && (
        <div className="space-y-2">
          {verificacoes.length === 0 ? (
            <div className="card text-center py-8 text-slate-500">Nenhuma verificação pendente 🎉</div>
          ) : verificacoes.map((v) => (
            <div key={v.id} className="card flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-sm">{v.profissional_nome}</p>
                <p className="text-xs text-slate-500">{v.tipo_registro} {v.numero_registro} {v.uf ? `(${v.uf})` : ''}</p>
                {v.diploma_url && <a href={v.diploma_url} target="_blank" rel="noopener" className="text-[10px] text-serenity-600 underline">ver diploma</a>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => decideVerificacao(v, 'aprovado')}
                  className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700">✓ {t('admin.approve')}</button>
                <button onClick={() => decideVerificacao(v, 'rejeitado')}
                  className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-700">✗ {t('admin.deny')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'pagamentos' && (
        <div className="space-y-2">
          {pagamentos.map((p) => (
            <div key={p.id} className="card flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-sm">{BRL(p.valor_centavos)} • {p.metodo.toUpperCase()}</p>
                <p className="text-xs text-slate-500">De {p.contratante_nome} → {p.profissional_nome}</p>
                <p className="text-[10px] text-slate-400">{new Date(p.criado_em + 'Z').toLocaleString('pt-BR')}</p>
              </div>
              <span className={p.status === 'pago' || p.status === 'split_realizado' ? 'badge-green' : p.status === 'pendente' ? 'badge-amber' : 'badge-rose'}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'webhooks' && (
        <div className="space-y-2">
          {webhooks.map((w) => (
            <div key={w.id} className="card">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-mono">{w.tipo}</p>
                  <p className="text-[10px] text-slate-500">{new Date(w.criado_em + 'Z').toLocaleString('pt-BR')}</p>
                </div>
                <span className={w.status_code === 200 ? 'badge-green' : w.status_code ? 'badge-amber' : 'badge-rose'}>
                  {w.status_code || 'ERR'}
                </span>
              </div>
              {w.erro && <p className="text-[10px] text-rose-500 mt-1">{w.erro}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
