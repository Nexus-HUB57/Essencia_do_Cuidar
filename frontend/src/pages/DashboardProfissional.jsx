import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Section, EmptyState, Spinner } from '../components/UI.jsx';

export default function DashboardProfissional() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [vagas, setVagas] = useState([]);
  const [cands, setCands] = useState([]);
  const [filtros, setFiltros] = useState({ complexidade: '', regiao: '', q: '' });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [p, v, c] = await Promise.all([
        api.getMeuPerfil().catch(() => null),
        api.listarVagas(filtros).catch(() => []),
        api.minhasCandidaturas().catch(() => []),
      ]);
      setPerfil(p); setVagas(v); setCands(c);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filtros.complexidade, filtros.regiao, filtros.q]);

  const candVagaIds = useMemo(() => new Set(cands.map(c => c.id_vaga)), [cands]);

  async function candidatar(v) {
    const msg = prompt('Mensagem para o contratante (opcional):', 'Olá! Tenho interesse na vaga e disponibilidade imediata.') ?? null;
    if (msg === null) return;
    try {
      await api.candidatar({ id_vaga: v.id, mensagem: msg || undefined });
      await load();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <Section
        title={`Olá, ${user.nome.split(' ')[0]} 👋`}
        subtitle="Encontre vagas compatíveis com seu perfil."
        action={
          <div className="flex gap-2">
            <Link to="/como-funciona" className="btn-ghost text-sm">Como Funciona</Link>
          </div>
        }
      >
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="card lg:col-span-1">
            <h3 className="font-semibold">Seu perfil</h3>
            {perfil ? (
              <ul className="mt-3 text-sm space-y-1 text-brand-ink/80">
                <li><b>Registro:</b> {perfil.registro_conselho || '—'}</li>
                <li><b>Especialidades:</b> {(perfil.especialidades || []).join(', ') || '—'}</li>
                <li><b>Disponibilidade:</b> {(perfil.disponibilidade?.periodos || []).join(', ') || '—'} · {(perfil.disponibilidade?.dias || []).join(', ') || '—'}</li>
              </ul>
            ) : <p className="mt-2 text-sm text-brand-slate">Carregando…</p>}
          </div>

          <div className="card lg:col-span-2">
            <h3 className="font-semibold">Suas candidaturas</h3>
            {cands.length === 0 ? (
              <p className="mt-2 text-sm text-brand-slate">Você ainda não se candidatou a nenhuma vaga.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {cands.map(c => (
                  <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <Link to={`/vagas/${c.id_vaga}`} className="font-medium text-brand-ink hover:text-brand-blue">{c.servico_descricao}</Link>
                      <p className="text-xs text-brand-slate">{c.regiao || '—'} · {c.complexidade === 'baixa' ? 'Baixa complexidade' : 'Média complexidade'}</p>
                    </div>
                    <span className={statusBadge(c.status_candidatura)}>{c.status_candidatura}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section title="Vagas disponíveis" subtitle="Use os filtros para refinar.">
        <div className="card mb-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <select className="input" value={filtros.complexidade} onChange={e => setFiltros(f => ({ ...f, complexidade: e.target.value }))}>
              <option value="">Todas as complexidades</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
            </select>
            <input className="input" placeholder="Região (ex: Zona Sul)" value={filtros.regiao} onChange={e => setFiltros(f => ({ ...f, regiao: e.target.value }))} />
            <input className="input" placeholder="Buscar por palavra-chave" value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          </div>
        </div>

        {loading ? (
          <div className="text-center text-brand-slate py-12"><Spinner /> Carregando vagas…</div>
        ) : vagas.length === 0 ? (
          <EmptyState title="Nenhuma vaga encontrada" description="Tente ajustar os filtros." />
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {vagas.map(v => (
              <li key={v.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/vagas/${v.id}`} className="font-semibold text-brand-ink hover:text-brand-blue">{v.profissional_desejado || 'Profissional de saúde'}</Link>
                  <span className={complexidadeBadge(v.complexidade)}>{v.complexidade === 'baixa' ? 'Baixa' : 'Média'}</span>
                </div>
                <p className="mt-1 text-sm text-brand-slate line-clamp-2">{v.servico_descricao}</p>
                <ul className="mt-3 text-xs text-brand-slate space-y-0.5">
                  <li>Paciente: {v.paciente_sexo || '—'} · {v.paciente_idade || '?'} anos · {v.paciente_diagnostico || 's/ diagnóstico'}</li>
                  <li>Jornada: {v.jornada_horario || '—'} · {v.jornada_escala || '—'}</li>
                  <li>Região: {v.regiao || '—'} · Contrato: {v.tipo_contrato || '—'}</li>
                  {v.remuneracao_valor && <li>Remuneração: R$ {v.remuneracao_valor} {v.remuneracao_tipo === 'hora' ? '/h' : '/plantão'}</li>}
                </ul>
                <div className="mt-4">
                  {candVagaIds.has(v.id)
                    ? <span className="badge-green">✓ Você se candidatou</span>
                    : <button onClick={() => candidatar(v)} className="btn-primary text-sm w-full">Candidatar-se</button>
                  }
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function statusBadge(s) {
  if (s === 'aceita') return 'badge-green';
  if (s === 'recusada') return 'badge-rose';
  if (s === 'visualizada') return 'badge-blue';
  return 'badge-amber';
}
function complexidadeBadge(c) { return c === 'baixa' ? 'badge-green' : 'badge-amber'; }
