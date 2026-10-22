import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { getErrorMessage } from '../utils/api';
import Estrelas from '../components/Estrelas';
import FavoritarBotao from '../components/FavoritarBotao';

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

interface ProfStats {
  total_candidaturas: number;
  aceitas: number;
  vagas_aceitas: number;
  vagas_concluidas: number;
}

interface AvalStats {
  total: number;
  media: number;
  cinco: number; quatro: number; tres: number; dois: number; um: number;
}

interface Aval {
  nota: number;
  comentario: string | null;
  criado_em: string;
  contratante_nome: string;
}

const DISP_LABEL: Record<string, string> = {
  manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', '12h': 'Turno 12h', '24h': 'Plantão 24h'
};

export default function ProfissionalPerfil() {
  const { id } = useParams();
  const [user, setUser] = useState<ProfUser | null>(null);
  const [detalhes, setDetalhes] = useState<ProfDetalhes | null>(null);
  const [stats, setStats] = useState<AvalStats | null>(null);
  const [profStats, setProfStats] = useState<ProfStats | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Aval[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, a] = await Promise.all([
          api.get(`/profissionais/${id}`),
          api.get(`/avaliacoes/profissional/${id}`)
        ]);
        setUser(p.data.user);
        const d = p.data.detalhes;
        if (d) {
          try { d.especialidades = JSON.parse(d.especialidades || '[]'); } catch { d.especialidades = []; }
          try { d.disponibilidade = JSON.parse(d.disponibilidade || '[]'); } catch { d.disponibilidade = []; }
          setDetalhes(d);
        }
        setProfStats(p.data.stats || null);
        setStats(a.data.stats);
        setAvaliacoes(a.data.avaliacoes);
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
            <p className="text-xs text-slate-400 mt-1">
              {anosNaPlataforma > 0 ? `${anosNaPlataforma} ${anosNaPlataforma > 1 ? 'anos' : 'ano'} na plataforma` : 'Novo na plataforma'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FavoritarBotao tipo="profissional" id={Number(id)} size="md" />
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

      {/* Estatísticas profissionais */}
      {profStats && (profStats.total_candidaturas > 0 || profStats.vagas_concluidas > 0) && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-serenity-600">{profStats.vagas_concluidas}</p>
            <p className="text-xs text-slate-500 mt-1">Atendimentos concluídos</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-emerald-600">{profStats.vagas_aceitas}</p>
            <p className="text-xs text-slate-500 mt-1">Vagas aceitas</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-amber-600">{profStats.total_candidaturas}</p>
            <p className="text-xs text-slate-500 mt-1">Candidaturas totais</p>
          </div>
        </div>
      )}

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
      {stats && stats.total > 0 && (
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold">Avaliações</h2>
            <Estrelas value={stats.media} total={stats.total} size="lg" />
          </div>
          {/* Distribuição */}
          <div className="grid grid-cols-5 gap-1.5 text-xs text-slate-600 mb-4">
            {[
              { label: '5⭐', val: stats.cinco },
              { label: '4⭐', val: stats.quatro },
              { label: '3⭐', val: stats.tres },
              { label: '2⭐', val: stats.dois },
              { label: '1⭐', val: stats.um }
            ].map((b) => {
              const pct = stats.total > 0 ? (b.val / stats.total) * 100 : 0;
              return (
                <div key={b.label}>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="w-7 text-right">{b.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            {avaliacoes.slice(0, 5).map((a, i) => (
              <div key={i} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{a.contratante_nome}</p>
                  <Estrelas value={a.nota} size="sm" showNumber={false} />
                </div>
                {a.comentario ? (
                  <p className="text-sm text-slate-600 italic">"{a.comentario}"</p>
                ) : (
                  <p className="text-xs text-slate-400">Sem comentário.</p>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  {new Date(a.criado_em + 'Z').toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state se não há avaliações */}
      {stats && stats.total === 0 && (
        <div className="card mt-4 text-center py-8 text-slate-500 text-sm">
          Ainda sem avaliações. Este profissional é novo na plataforma.
        </div>
      )}

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
