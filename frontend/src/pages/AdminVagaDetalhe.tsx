import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../context/AuthContext';
import api from '../utils/api';

interface VagaDetalhe {
  id: number;
  id_contratante: number;
  contratante_nome: string;
  contratante_email: string;
  contratante_telefone: string | null;
  servico_descricao: string;
  profissional_desejado: string;
  complexidade: 'baixa' | 'media';
  paciente_sexo: string | null;
  paciente_idade: number | null;
  paciente_diagnostico: string | null;
  jornada_horario: string | null;
  jornada_escala: string | null;
  tipo_contrato: 'PJ' | 'CLT' | null;
  remuneracao_tipo: 'plantao' | 'hora' | null;
  remuneracao_valor: number | null;
  regiao: string | null;
  status: 'ativa' | 'pausada' | 'fechada';
  moderacao_status: 'ok' | 'flagged' | 'removida';
  moderacao_motivo: string | null;
  moderado_por: number | null;
  moderado_por_nome?: string | null;
  moderado_em: string | null;
  criado_em: string;
}

interface Candidatura {
  id: number;
  id_profissional: number;
  profissional_nome: string;
  mensagem: string | null;
  status_candidatura: string;
  criado_em: string;
}

interface HistoricoEntry {
  id: number;
  id_admin: number;
  admin_nome: string;
  acao: 'flag' | 'unflag' | 'remove' | 'restore' | 'view';
  motivo: string | null;
  criado_em: string;
}

interface VagaDetail {
  vaga: VagaDetalhe;
  candidaturas: Candidatura[];
  historico: HistoricoEntry[];
}

export default function AdminVagaDetalhe() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState<VagaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/vagas/${id}`);
      setData(data);
    } catch (err) {
      setErro(getErrorMessage(err));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function acao(tipo: 'flag' | 'unflag' | 'remove' | 'restore', confirmar = false) {
    if (!data) return;
    if (confirmar && !window.confirm(t('admin.vagas.confirmRemove'))) return;
    const motivo = (window.prompt(t('admin.vagas.motivoLabel') + ` (${tipo})`, '') || '').trim();
    if (motivo.length < 3) { toast.error('motivo obrigatório (mín. 3 chars)'); return; }
    try {
      await api.post(`/admin/vagas/${id}/${tipo}`, { motivo });
      toast.success(`✓ ${tipo}`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  if (loading) return <div className="container-page py-16 text-center text-slate-500">…</div>;
  if (erro) return <div className="container-page py-16 text-center text-rose-600">{erro}</div>;
  if (!data) return null;
  const v = data.vaga;

  return (
    <div className="min-h-[80vh] bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link to="/admin" className="text-sm text-serenity-600 hover:underline">{t('admin.detalhe.voltar')}</Link>

        <header className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('admin.detalhe.title', { id: v.id })}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">{v.servico_descricao}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <BadgeVagaStatus s={v.status} />
              <BadgeModStatus s={v.moderacao_status} />
              <span className="text-xs text-slate-500">
                {t('admin.detalhe.mod', { status: v.moderacao_status })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {v.moderacao_status === 'ok' && (
              <button onClick={() => acao('flag')} className="btn-secondary text-sm">
                {t('admin.vagas.actions.flag')}
              </button>
            )}
            {v.moderacao_status === 'flagged' && (
              <>
                <button onClick={() => acao('unflag')} className="btn-secondary text-sm">
                  {t('admin.vagas.actions.unflag')}
                </button>
                <button onClick={() => acao('remove', true)} className="btn-danger text-sm">
                  {t('admin.vagas.actions.remove')}
                </button>
              </>
            )}
            {v.moderacao_status === 'removida' && (
              <button onClick={() => acao('restore')} className="btn-primary text-sm">
                {t('admin.vagas.actions.restore')}
              </button>
            )}
          </div>
        </header>

        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          {/* Coluna principal: vaga + candidaturas */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card">
              <h3 className="font-semibold text-slate-900">Vaga</h3>
              <dl className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Item label="Serviço" value={v.servico_descricao} />
                <Item label="Profissional desejado" value={v.profissional_desejado} />
                <Item label="Complexidade" value={v.complexidade} />
                <Item label="Região" value={v.regiao} />
                <Item label="Jornada" value={`${v.jornada_horario || '—'} · ${v.jornada_escala || '—'}`} />
                <Item label="Contrato" value={`${v.tipo_contrato || '—'} · ${v.remuneracao_tipo || '—'} · R$ ${v.remuneracao_valor ?? '—'}`} />
                <Item label="Paciente" value={`${v.paciente_sexo || '?'} · ${v.paciente_idade ?? '?'} anos · ${v.paciente_diagnostico || 's/ diagnóstico'}`} />
                <Item label="Criada em" value={new Date(v.criado_em).toLocaleString('pt-BR')} />
              </dl>
            </div>

            <div className="card">
              <h3 className="font-semibold text-slate-900">
                {t('admin.detalhe.candidaturas', { n: data.candidaturas.length })}
              </h3>
              {data.candidaturas.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{t('admin.detalhe.semCands')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.candidaturas.map(c => (
                    <li key={c.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{c.profissional_nome}</p>
                        <span className="text-[11px] text-slate-500">{c.status_candidatura}</span>
                      </div>
                      {c.mensagem && <p className="text-sm text-slate-600 mt-1">"{c.mensagem}"</p>}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(c.criado_em).toLocaleString('pt-BR')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Sidebar: contratante + histórico */}
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold text-slate-900">Contratante</h3>
              <dl className="mt-3 text-sm">
                <Item label="Nome" value={v.contratante_nome} />
                <Item label="E-mail" value={v.contratante_email} />
                <Item label="Telefone" value={v.contratante_telefone || '—'} />
              </dl>
            </div>

            <div className="card">
              <h3 className="font-semibold text-slate-900">{t('admin.detalhe.historico')}</h3>
              {data.historico.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{t('admin.detalhe.semHistorico')}</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {data.historico.map(h => (
                    <li key={h.id} className="text-xs border-l-2 border-slate-200 pl-2">
                      <div className="flex items-center gap-2">
                        <AcaoBadge a={h.acao} />
                        <span className="text-slate-700 font-medium">{h.admin_nome}</span>
                      </div>
                      <p className="text-slate-500 mt-0.5">
                        {new Date(h.criado_em).toLocaleString('pt-BR')}
                      </p>
                      {h.motivo && <p className="text-slate-600 mt-0.5">"{h.motivo}"</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
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
function AcaoBadge({ a }: { a: HistoricoEntry['acao'] }) {
  const map: Record<HistoricoEntry['acao'], string> = {
    flag:    'bg-amber-100 text-amber-700',
    unflag:  'bg-slate-200 text-slate-700',
    remove:  'bg-rose-100 text-rose-700',
    restore: 'bg-emerald-100 text-emerald-700',
    view:    'bg-blue-100 text-blue-700'
  };
  return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${map[a]}`}>{a}</span>;
}
