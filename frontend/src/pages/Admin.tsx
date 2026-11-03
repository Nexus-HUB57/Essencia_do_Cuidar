/**
 * Feature 5 — Painel administrativo.
 * Tabs: stats, users, vagas, verificações, pagamentos, webhooks, protocolos.
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
interface ProtocoloPPP {
  id: number;
  id_vaga: number;
  id_contratante: number;
  id_profissional: number;
  status: string;
  valor_plantao_centavos: number;
  valor_total_centavos: number;
  checkout_profissional_em: string;
  contratante_nome: string;
  profissional_nome: string;
  vaga_titulo: string;
  horas_desde_checkout: number;
  proxima_notificacao: string;
}
interface ProtocoloPNP {
  id: number;
  id_vaga: number;
  status: string;
  valor_plantao_centavos: number;
  motivo_rejeicao: string;
  criado_em: string;
  contratante_nome: string;
  profissional_nome: string;
  vaga_titulo: string;
}
interface ProtocoloStats {
  pendente: number;
  enviado: number;
  aceito: number;
  em_custodia: number;
  checkout_pendente: number;
  checkout_profissional: number;
  checkout_completo: number;
  liberado: number;
  liberado_parcial: number;
  recusado_pnp: number;
  em_analise_pnp: number;
  reembolsado: number;
  expirado: number;
  cancelado: number;
  valor_em_custodia_centavos: number;
  valor_liberado_centavos: number;
}

const BRL = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

export default function Admin() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'stats' | 'users' | 'vagas' | 'verificacoes' | 'pagamentos' | 'webhooks' | 'protocolos'>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [verificacoes, setVerificacoes] = useState<Verificacao[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [pppPendentes, setPppPendentes] = useState<ProtocoloPPP[]>([]);
  const [pnpEmAnalise, setPnpEmAnalise] = useState<ProtocoloPNP[]>([]);
  const [protoStats, setProtoStats] = useState<ProtocoloStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.is_admin) return;
    if (tab === 'stats') loadStats();
    if (tab === 'users') loadUsers();
    if (tab === 'vagas') loadVagas();
    if (tab === 'verificacoes') loadVerificacoes();
    if (tab === 'pagamentos') loadPagamentos();
    if (tab === 'webhooks') loadWebhooks();
    if (tab === 'protocolos') loadProtocolos();
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
  async function loadProtocolos() {
    setLoading(true);
    setCleanupResult(null);
    try {
      const [s, ppp, pnp] = await Promise.all([
        api.get('/admin/protocolos/stats'),
        api.get('/protocolos/ppp/pendentes'),
        api.get('/protocolos/pnp/em-analise')
      ]);
      setProtoStats(s.data);
      setPppPendentes(ppp.data.ppp_pendentes || []);
      setPnpEmAnalise(pnp.data.pnp_em_analise || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function rodarCronManual() {
    if (!confirm('Rodar cleanup de protocolos manualmente? (PPP + expiração + CGPP)')) return;
    setCleanupResult('Rodando...');
    try {
      const { data } = await api.post('/admin/protocolos/cleanup');
      setCleanupResult(`✅ Cron executado: ${JSON.stringify(data)}`);
      loadProtocolos();  // recarrega
    } catch (e) {
      setCleanupResult(`❌ Erro: ${getErrorMessage(e)}`);
    }
  }

  async function liberarManual(id: number) {
    if (!confirm(`Liberar pagamento do protocolo #${id} imediatamente? (ignora 72h do CGPP)`)) return;
    try {
      await api.post(`/protocolos/${id}/liberar`);
      alert('✅ Pagamento liberado');
      loadProtocolos();
    } catch (e) { alert(getErrorMessage(e)); }
  }

  async function resolverPNP(id: number, decisao: 'reembolso_total' | 'reembolso_parcial' | 'liberar_profissional') {
    let valor_parcial_centavos: number | undefined;
    let motivo = '';
    if (decisao === 'reembolso_parcial') {
      const v = prompt('Valor parcial em centavos para o PROFISSIONAL (ex: 25000 = R$ 250):');
      if (!v) return;
      valor_parcial_centavos = Number(v);
    }
    motivo = prompt('Motivo da decisão:') || '';
    if (!motivo) return;
    try {
      await api.post(`/protocolos/${id}/resolver-pnp`, { decisao, valor_parcial_centavos, motivo });
      alert('✅ PNP resolvido');
      loadProtocolos();
    } catch (e) { alert(getErrorMessage(e)); }
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
          { k: 'webhooks', l: `🔗 ${t('admin.webhooks')}` },
          { k: 'protocolos', l: '🛡️ Protocolos' }
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

      {/* ────────────────────────────────────────────────────────────────
          Tab PROTOCOLOS — PCP/PCM/PDC/PPP/PNP/CGPP
       ──────────────────────────────────────────────────────────────── */}
      {!loading && tab === 'protocolos' && protoStats && (
        <div className="space-y-6">

          {/* Stats de protocolos por status */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-slate-700">Status dos protocolos</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {[
                { l: 'Pendente', v: protoStats.pendente, color: 'badge-slate' },
                { l: 'Enviado', v: protoStats.enviado, color: 'badge-blue' },
                { l: 'Aceito', v: protoStats.aceito, color: 'badge-amber' },
                { l: 'Em Custódia', v: protoStats.em_custodia, color: 'badge-purple' },
                { l: 'Checkout Pend.', v: protoStats.checkout_pendente, color: 'badge-amber' },
                { l: 'Checkout Prof.', v: protoStats.checkout_profissional, color: 'badge-amber' },
                { l: 'Checkout Compl.', v: protoStats.checkout_completo, color: 'badge-green' },
                { l: 'Liberado', v: protoStats.liberado, color: 'badge-green' },
                { l: 'Liberado Parc.', v: protoStats.liberado_parcial, color: 'badge-green' },
                { l: 'Recusado PNP', v: protoStats.recusado_pnp, color: 'badge-rose' },
                { l: 'Em Análise PNP', v: protoStats.em_analise_pnp, color: 'badge-amber' },
                { l: 'Reembolsado', v: protoStats.reembolsado, color: 'badge-slate' },
                { l: 'Expirado', v: protoStats.expirado, color: 'badge-slate' },
                { l: 'Cancelado', v: protoStats.cancelado, color: 'badge-slate' }
              ].map((s, i) => (
                <div key={i} className="card p-2">
                  <p className="text-[10px] text-slate-500">{s.l}</p>
                  <p className="text-xl font-bold mt-0.5">{s.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="card p-3 bg-purple-50">
                <p className="text-xs text-slate-600">💵 Em custódia (retido)</p>
                <p className="text-xl font-bold text-purple-700">{BRL(protoStats.valor_em_custodia_centavos)}</p>
              </div>
              <div className="card p-3 bg-emerald-50">
                <p className="text-xs text-slate-600">💸 Já liberado a profissionais</p>
                <p className="text-xl font-bold text-emerald-700">{BRL(protoStats.valor_liberado_centavos)}</p>
              </div>
            </div>
          </div>

          {/* Botão para rodar cron manual */}
          <div className="card p-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">⚙️ Cron manual de protocolos</p>
              <p className="text-xs text-slate-500">Dispara PPP (notificações + auto-confirmação 48h) + expiração + CGPP (liberação 72h)</p>
            </div>
            <button onClick={rodarCronManual}
              className="text-xs px-3 py-1.5 rounded bg-serenity-600 text-white hover:bg-serenity-700">
              Rodar agora
            </button>
          </div>
          {cleanupResult && (
            <div className="card p-3 text-xs font-mono bg-slate-50 break-all">
              {cleanupResult}
            </div>
          )}

          {/* PPP pendentes (contratante não respondeu em 24/48h) */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-slate-700">
              📋 PPP pendentes (contratante ainda não fez checkout)
            </h3>
            {pppPendentes.length === 0 ? (
              <div className="card text-center py-6 text-slate-500 text-sm">
                Nenhum PPP pendente 🎉 (todos os contratantes confirmaram a tempo)
              </div>
            ) : (
              <div className="space-y-2">
                {pppPendentes.map((p) => (
                  <div key={p.id} className="card flex items-center justify-between gap-3 flex-wrap p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        #{p.id} — {p.vaga_titulo || `Vaga ${p.id_vaga}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Contratante: {p.contratante_nome} • Profissional: {p.profissional_nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        Valor: {BRL(p.valor_plantao_centavos)} • Status: <span className="font-mono">{p.status}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        ⏱️ {p.horas_desde_checkout}h desde checkout profissional
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={p.proxima_notificacao === 'auto-confirmação' ? 'badge-rose' : p.proxima_notificacao.startsWith('3ª') ? 'badge-amber' : 'badge-blue'}>
                        {p.proxima_notificacao}
                      </span>
                      <button onClick={() => liberarManual(p.id)}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        Liberar agora
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PNP em análise (admin precisa decidir) */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-slate-700">
              ⚖️ PNP em análise administrativa (precisa de decisão)
            </h3>
            {pnpEmAnalise.length === 0 ? (
              <div className="card text-center py-6 text-slate-500 text-sm">
                Nenhum PNP em análise 🎉
              </div>
            ) : (
              <div className="space-y-2">
                {pnpEmAnalise.map((p) => (
                  <div key={p.id} className="card p-3 border-l-4 border-l-amber-500">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">#{p.id} — {p.vaga_titulo || `Vaga ${p.id_vaga}`}</p>
                        <p className="text-xs text-slate-500">
                          Contratante: {p.contratante_nome} • Profissional: {p.profissional_nome}
                        </p>
                        <p className="text-xs text-slate-500">
                          Valor: {BRL(p.valor_plantao_centavos)} • Motivo: <span className="font-mono">{p.motivo_rejeicao || '—'}</span>
                        </p>
                        <p className="text-[10px] text-slate-400">{new Date(p.criado_em + 'Z').toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => resolverPNP(p.id, 'reembolso_total')}
                          className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700">
                          Reembolso total
                        </button>
                        <button onClick={() => resolverPNP(p.id, 'reembolso_parcial')}
                          className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                          Reembolso parcial
                        </button>
                        <button onClick={() => resolverPNP(p.id, 'liberar_profissional')}
                          className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                          Liberar ao prof.
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
