import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner } from '../components/UI.jsx';
import StarRating from '../components/StarRating.jsx';

/**
 * Página pública (autenticada) com TODAS as avaliações de um profissional.
 * Acessada via:
 *   - botão "Ver avaliações" no DashboardProfissional
 *   - link "Ver avaliações" no perfil / candidato
 */
export default function AvaliacoesProfissional() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.reviewsProfissional(id)
      .then(d => alive && setData(d))
      .catch(e => alive && setErro(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="container-page py-16 text-center"><Spinner /></div>;
  if (erro) return <div className="container-page py-16 text-center text-rose-600">{erro}</div>;
  if (!data) return null;

  return (
    <section className="container-page py-8 sm:py-10">
      <Link to={`/dashboard-profissional`} className="text-sm text-brand-blue">← Voltar</Link>

      <header className="mt-4 card flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Avaliações</h1>
          <p className="text-sm text-brand-slate">Reputação construída a partir de serviços concluídos na plataforma.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-3xl font-semibold leading-none">{data.media.toFixed(1)}</p>
            <p className="text-xs text-brand-slate">de 5,0</p>
          </div>
          <div className="flex flex-col items-start">
            <StarRating value={Math.round(data.media)} readOnly size="md" />
            <p className="mt-1 text-xs text-brand-slate">{data.total} avaliação{data.total === 1 ? '' : 'es'}</p>
          </div>
        </div>
      </header>

      {data.total > 0 && (
        <div className="mt-4 card">
          <h2 className="text-sm font-semibold">Distribuição</h2>
          <ul className="mt-2 space-y-1">
            {[5, 4, 3, 2, 1].map(star => {
              const qtd = data.distribuicao[star] || 0;
              const pct = data.total ? Math.round((qtd / data.total) * 100) : 0;
              return (
                <li key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-right text-brand-slate">{star}★</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-brand-slate">{qtd}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6">
        {data.reviews.length === 0 ? (
          <div className="card text-center py-10">
            <h3 className="text-lg font-semibold">Nenhuma avaliação ainda</h3>
            <p className="mt-1 text-sm text-brand-slate">Quando os contratantes avaliarem, elas aparecem aqui.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.reviews.map(r => (
              <li key={r.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-brand-ink">{r.contratante_nome}</p>
                    <p className="text-xs text-brand-slate">
                      {new Date(r.criado_em).toLocaleDateString('pt-BR')} · {r.regiao || 'região não informada'}
                    </p>
                  </div>
                  <StarRating value={r.nota} readOnly size="sm" />
                </div>
                <p className="mt-2 text-sm text-brand-ink/90 line-clamp-3">"{r.comentario || 'Sem comentário.'}"</p>
                <p className="mt-2 text-xs text-brand-slate">Vaga: {r.servico_descricao}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
