import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { getErrorMessage } from '../utils/api';
import StarRating from '../components/StarRating';
import type { Avaliacao, AvaliacaoStats } from '../types';

interface ProfDetalhes {
  id_user: number;
  registro_conselho: string | null;
  tipo_registro: string | null;
  registro_verificado: 0 | 1;
  diploma_nome_original: string | null;
  diploma_verificado: 0 | 1;
  especialidades: string[];
  disponibilidade: string[];
  bio: string | null;
}

interface ProfUser {
  id: number;
  nome: string;
  telefone: string | null;
  criado_em: string;
}

const DISP_LABEL: Record<string, string> = {
  manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', '12h': 'Turno 12h', '24h': 'Plantão 24h'
};

export default function ProfissionalPerfil() {
  const { id } = useParams();
  const [user, setUser] = useState<ProfUser | null>(null);
  const [detalhes, setDetalhes] = useState<ProfDetalhes | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [stats, setStats] = useState<AvaliacaoStats>({ total: 0, media: 0 });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Carrega perfil + reviews em paralelo
        const [perfilRes, reviewsRes] = await Promise.all([
          api.get(`/profissionais/${id}`),
          api.get(`/avaliacoes/profissional/${id}`)
        ]);
        setUser(perfilRes.data.user);
        const d = perfilRes.data.detalhes;
        if (d) {
          try { d.especialidades = JSON.parse(d.especialidades || '[]'); } catch { d.especialidades = []; }
          try { d.disponibilidade = JSON.parse(d.disponibilidade || '[]'); } catch { d.disponibilidade = []; }
          setDetalhes(d);
        }
        if (perfilRes.data.stats) setStats(perfilRes.data.stats);
        setAvaliacoes(reviewsRes.data.avaliacoes || []);
      } catch (err) {
        setErro(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="text-center py-20 text-slate-400">Carregando perfil...</div>;
  if (erro) return <div className="text-center py-20 text-rose-500">{erro}</div>;
  if (!user) return null;

  const inicial = user.nome[0]?.toUpperCase();
  const anosNaPlataforma = Math.max(
    0,
    Math.floor((Date.now() - new Date(user.criado_em + 'Z').getTime()) / (365 * 24 * 60 * 60 * 1000))
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 fade-in">
      <Link to="/vagas" className="text-serenity-600 text-sm hover:underline">← Voltar</Link>

      {/* Hero do perfil */}
      <div className="card mt-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-serenity-400 to-emerald-400" />
        <div className="relative pt-12 flex items-end gap-4 flex-wrap">
          <div className="w-24 h-24 rounded-2xl bg-white shadow-card flex items-center justify-center text-3xl font-bold text-serenity-600 -mt-12">
            {inicial}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{user.nome}</h1>
            {detalhes?.tipo_registro && (
              <p className="text-slate-500 text-sm mt-1">
                {detalhes.tipo_registro} {detalhes.registro_conselho}
                {detalhes.registro_verificado === 1 && (
                  <span className="badge-green ml-2">✓ Registro verificado</span>
                )}
              </p>
            )}
            {/* Avaliação em destaque */}
            {stats.total > 0 ? (
              <div className="mt-1.5 flex items-center gap-2">
                <StarRating value={stats.media} count={stats.total} size="sm" />
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-1">Sem avaliações ainda</p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              {anosNaPlataforma > 0 ? `${anosNaPlataforma} ${anosNaPlataforma > 1 ? 'anos' : 'ano'} na plataforma` : 'Novo na plataforma'}
            </p>
          </div>
          {user.telefone && (
            <a
              href={`https://wa.me/55${user.telefone.replace(/\D/g, '')}`}
              target="_blank" rel="noopener"
              className="btn-secondary text-sm"
            >
              📱 WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Bio */}
      {detalhes?.bio && (
        <div className="card mt-4">
          <h2 className="font-semibold mb-2">Sobre</h2>
          <p className="text-slate-700 leading-relaxed text-sm">{detalhes.bio}</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        {/* Especialidades */}
        <div className="card">
          <h2 className="font-semibold mb-3">Especialidades</h2>
          {detalhes?.especialidades && detalhes.especialidades.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detalhes.especialidades.map((e) => (
                <span key={e} className="badge-blue">{e}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma especialidade cadastrada.</p>
          )}
        </div>

        {/* Disponibilidade */}
        <div className="card">
          <h2 className="font-semibold mb-3">Disponibilidade</h2>
          {detalhes?.disponibilidade && detalhes.disponibilidade.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detalhes.disponibilidade.map((d) => (
                <span key={d} className="badge-green">{DISP_LABEL[d] || d}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Não informada.</p>
          )}
        </div>
      </div>

      {/* Avaliações */}
      <div className="card mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Avaliações</h2>
          {stats.total > 0 && (
            <div className="flex items-center gap-2">
              <StarRating value={stats.media} count={stats.total} size="sm" />
            </div>
          )}
        </div>
        {avaliacoes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Este profissional ainda não recebeu avaliações. 😊
          </p>
        ) : (
          <div className="space-y-3">
            {avaliacoes.map((a) => (
              <div key={a.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StarRating value={a.nota} mode="display" size="sm" showNumber={false} />
                    <span className="text-xs text-slate-500">— {a.avaliador_nome}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(a.criado_em + 'Z').toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {a.comentario && (
                  <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">{a.comentario}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documentos */}
      <div className="card mt-4">
        <h2 className="font-semibold mb-3">Documentos e verificação</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span>Diploma / certificado</span>
            {detalhes?.diploma_nome_original ? (
              detalhes.diploma_verificado === 1 ? (
                <span className="badge-green">✓ Verificado</span>
              ) : (
                <span className="badge-amber">⏳ Em análise</span>
              )
            ) : (
              <span className="badge-slate">Não enviado</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <span>Registro profissional</span>
            {detalhes?.registro_conselho ? (
              detalhes.registro_verificado === 1 ? (
                <span className="badge-green">✓ Verificado</span>
              ) : (
                <span className="badge-amber">⏳ Em análise</span>
              )
            ) : (
              <span className="badge-slate">Não informado</span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          💡 Verificações acontecem em até 24h após o envio. Caso note algo
          inconsistente, entre em contato com a gente.
        </p>
      </div>
    </div>
  );
}
