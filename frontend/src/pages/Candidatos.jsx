import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { EmptyState, Spinner } from '../components/UI.jsx';

export default function Candidatos() {
  const { id } = useParams();
  const [vaga, setVaga] = useState(null);
  const [cands, setCands] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [v, c] = await Promise.all([api.getVaga(id), api.candidatosDaVaga(id)]);
      setVaga(v); setCands(c);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function setStatus(cId, status_candidatura) {
    await api.atualizarCandidatura(cId, status_candidatura);
    load();
  }

  if (loading) return <div className="container-page py-16 text-center"><Spinner /></div>;
  if (!vaga) return <div className="container-page py-16 text-center text-rose-600">Vaga não encontrada</div>;

  return (
    <section className="container-page py-10 sm:py-14">
      <Link to="/dashboard-contratante" className="text-sm text-brand-blue">← Voltar</Link>
      <h1 className="mt-3 text-2xl font-semibold">Candidatos — {vaga.profissional_desejado || 'Vaga'}</h1>
      <p className="text-sm text-brand-slate">{cands.length} candidato(s)</p>

      <div className="mt-6">
        {cands.length === 0 ? (
          <EmptyState title="Nenhum candidato ainda" description="A vaga será listada para profissionais compatíveis." />
        ) : (
          <ul className="grid gap-3">
            {cands.map(c => (
              <li key={c.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.nome}</p>
                    <p className="text-xs text-brand-slate">{c.email} · {c.telefone || 's/ telefone'}</p>
                    <p className="mt-1 text-xs"><b>Registro:</b> {c.registro_conselho || '—'}</p>
                    {c.especialidades?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.especialidades.map(e => <span key={e} className="badge-blue">{e}</span>)}
                      </div>
                    )}
                    {c.mensagem && <p className="mt-2 text-sm text-brand-ink/80 whitespace-pre-line">"{c.mensagem}"</p>}
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <span className={statusBadge(c.status_candidatura)}>{c.status_candidatura}</span>
                    <div className="flex flex-wrap gap-2">
                      {c.status_candidatura !== 'aceita' && <button onClick={() => setStatus(c.id, 'aceita')} className="btn-primary text-xs">Aceitar</button>}
                      {c.status_candidatura !== 'recusada' && <button onClick={() => setStatus(c.id, 'recusada')} className="btn-ghost text-xs">Recusar</button>}
                      <Link to={`/vagas/${vaga.id}/chat`} className="btn-secondary text-xs">Abrir chat</Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function statusBadge(s) {
  if (s === 'aceita') return 'badge-green';
  if (s === 'recusada') return 'badge-rose';
  if (s === 'visualizada') return 'badge-blue';
  return 'badge-amber';
}
