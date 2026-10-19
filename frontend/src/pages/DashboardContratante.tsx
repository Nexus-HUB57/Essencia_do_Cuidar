import { useEffect, useState } from 'react';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import api from '../utils/api';
import type { Vaga, AvaliacaoPendente } from '../types';
import Chat from '../components/Chat';
import AvaliacaoModal from '../components/AvaliacaoModal';
import StarRating from '../components/StarRating';
import VerificationBadge, { type VerificationStatus } from '../components/VerificationBadge';

interface Candidato {
  id: number;
  mensagem: string | null;
  status_candidatura: string;
  criado_em: string;
  profissional_id: number;
  profissional_nome: string;
  profissional_email: string;
  profissional_telefone: string;
  registro_conselho: string | null;
  tipo_registro: string | null;
  diploma_verificado: 0 | 1;
  registro_verificado: 0 | 1;
  especialidades: string[];
  disponibilidade: string[];
  bio: string | null;
  verificacao_status?: 'pendente' | 'verificado_auto' | 'verificado_manual' | 'rejeitado' | 'inativo';
}

interface HistoricoItem {
  vaga_id: number;
  profissional_desejado: string;
  complexidade: string;
  regiao: string | null;
  remuneracao_valor: number | null;
  remuneracao_tipo: string | null;
  criado_em: string;
  profissional_id: number;
  profissional_nome: string;
  profissional_telefone: string | null;
  candidatura_id: number;
  candidatura_em: string;
  avaliacao: { nota: number; comentario: string | null; criado_em: string } | null;
}

const TURNOS = [
  { v: 'manha', l: 'Manhã' },
  { v: 'tarde', l: 'Tarde' },
  { v: 'noite', l: 'Noite' }
];

const PROFISSIONAIS_OPCOES = [
  'Cuidador de Idosos', 'Enfermeiro', 'Técnico de Enfermagem',
  'Fisioterapeuta', 'Psicólogo', 'Terapeuta Ocupacional', 'Nutricionista', 'Médico'
];

export default function DashboardContratante() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'vagas' | 'nova' | 'avaliacoes'>('vagas');
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [vagaSel, setVagaSel] = useState<Vaga | null>(null);
  const [avPendentes, setAvPendentes] = useState<AvaliacaoPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatCom, setChatCom] = useState<{ id: number; nome: string } | null>(null);
  const [avaliar, setAvaliar] = useState<AvaliacaoPendente | null>(null);

  // form de nova vaga
  const [form, setForm] = useState({
    paciente_sexo: '' as '' | 'M' | 'F' | 'Outro',
    paciente_idade: '',
    paciente_diagnostico: '',
    complexidade: 'baixa' as 'baixa' | 'media',
    servico_descricao: '',
    profissional_desejado: '',
    jornada_horario: '',
    jornada_escala: '',
    tipo_contrato: '' as '' | 'PJ' | 'CLT',
    remuneracao_tipo: '' as '' | 'plantao' | 'hora',
    remuneracao_valor: '',
    regiao: ''
  });
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => { carregarVagas(); }, []);
  useEffect(() => { if (vagaSel) carregarCandidatos(vagaSel.id); }, [vagaSel]);
  useEffect(() => { if (tab === 'avaliacoes') carregarAvPendentes(); }, [tab]);

  async function carregarVagas() {
    setLoading(true);
    try {
      const { data } = await api.get('/vagas/contratante/minhas');
      setVagas(data.vagas);
    } catch (err) {
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function carregarCandidatos(vagaId: number) {
    try {
      const { data } = await api.get(`/candidaturas/vaga/${vagaId}`);
      setCandidatos(data.candidatos);
    } catch (err) {
      console.error(getErrorMessage(err));
    }
  }

  async function carregarHistorico() {
    setLoading(true);
    try {
      const { data } = await api.get('/candidaturas/contratante/historico');
      setHistorico(data.historico);
    } catch (err) {
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function publicar() {
    setErro('');
    setSucesso('');
    if (!form.servico_descricao || form.servico_descricao.length < 10) {
      setErro('Descreva o serviço (mínimo 10 caracteres).');
      return;
    }
    if (!form.profissional_desejado) {
      setErro('Selecione o profissional desejado.');
      return;
    }
    try {
      const payload: any = {
        complexidade: form.complexidade,
        servico_descricao: form.servico_descricao,
        profissional_desejado: form.profissional_desejado,
        paciente_sexo: form.paciente_sexo || undefined,
        paciente_idade: form.paciente_idade ? Number(form.paciente_idade) : undefined,
        paciente_diagnostico: form.paciente_diagnostico || undefined,
        jornada_horario: form.jornada_horario || undefined,
        jornada_escala: form.jornada_escala || undefined,
        tipo_contrato: form.tipo_contrato || undefined,
        remuneracao_tipo: form.remuneracao_tipo || undefined,
        remuneracao_valor: form.remuneracao_valor ? Number(form.remuneracao_valor) : undefined,
        regiao: form.regiao || undefined
      };
      await api.post('/vagas', payload);
      setSucesso('Vaga publicada com sucesso!');
      setForm({
        paciente_sexo: '', paciente_idade: '', paciente_diagnostico: '',
        complexidade: 'baixa', servico_descricao: '', profissional_desejado: '',
        jornada_horario: '', jornada_escala: '', tipo_contrato: '',
        remuneracao_tipo: '', remuneracao_valor: '', regiao: ''
      });
      await carregarVagas();
      setTab('vagas');
    } catch (err) {
      setErro(getErrorMessage(err));
    }
  }

  async function setStatusCandidatura(id: number, status: 'aceita' | 'recusada') {
    try {
      await api.patch(`/candidaturas/${id}`, { status_candidatura: status });
      if (vagaSel) await carregarCandidatos(vagaSel.id);
      toast.success(status === 'aceita' ? 'Candidatura aceita!' : 'Candidatura recusada.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function setStatusVaga(id: number, status: 'ativa' | 'pausada' | 'fechada') {
    try {
      await api.patch(`/vagas/${id}/status`, { status });
      await carregarVagas();
      if (vagaSel?.id === id) {
        const { data } = await api.get(`/vagas/${id}`);
        setVagaSel(data.vaga);
      }
      if (status === 'fechada') {
        toast.success('Vaga encerrada! Agora você pode avaliar o profissional.');
      }
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

  if (vagaSel) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 fade-in">
        <button onClick={() => setVagaSel(null)} className="text-serenity-600 text-sm hover:underline mb-4">
          ← Voltar para minhas vagas
        </button>
        <div className="card mb-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-bold">{vagaSel.profissional_desejado}</h1>
              <p className="text-slate-500 text-sm">{vagaSel.regiao || '—'} • {vagaSel.jornada_horario || '—'}</p>
            </div>
            <div className="flex gap-2">
              <span className={vagaSel.status === 'ativa' ? 'badge-green' : vagaSel.status === 'pausada' ? 'badge-amber' : 'badge-slate'}>
                {vagaSel.status}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-700 mt-3">{vagaSel.servico_descricao}</p>
          <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2 flex-wrap">
            {vagaSel.status === 'ativa' && (
              <button onClick={() => setStatusVaga(vagaSel.id, 'pausada')} className="btn-ghost text-xs">Pausar vaga</button>
            )}
            {vagaSel.status === 'pausada' && (
              <button onClick={() => setStatusVaga(vagaSel.id, 'ativa')} className="btn-primary text-xs">Reativar</button>
            )}
            <button onClick={() => setStatusVaga(vagaSel.id, 'fechada')} className="btn-danger text-xs">Encerrar vaga</button>
          </div>
        </div>

        <h2 className="font-semibold mb-3">Candidatos ({candidatos.length})</h2>
        {candidatos.length === 0 ? (
          <div className="card text-center py-12 text-slate-500">
            Nenhum candidato ainda. Profissionais verão sua vaga na busca.
          </div>
        ) : (
          <div className="space-y-3">
            {candidatos.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-serenity-400 to-emerald-400 text-white flex items-center justify-center font-semibold">
                      {c.profissional_nome[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold">{c.profissional_nome}</h3>
                      <p className="text-xs text-slate-500">
                        {c.tipo_registro} {c.registro_conselho}
                        {c.registro_verificado === 1 && <span className="badge-green ml-2 text-[10px]">✓ Verificado</span>}
                      </p>
                      <div className="mt-1">
                        <VerificationBadge status={c.verificacao_status} size="sm" />
                      </div>
                    </div>
                  </div>
                  <div>
                    {c.status_candidatura === 'pendente' && <span className="badge-amber">Pendente</span>}
                    {c.status_candidatura === 'visualizada' && <span className="badge-blue">Visualizada</span>}
                    {c.status_candidatura === 'aceita' && <span className="badge-green">✓ Aceita</span>}
                    {c.status_candidatura === 'recusada' && <span className="badge-rose">Recusada</span>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.especialidades.map((e) => (
                    <span key={e} className="badge-blue text-[10px]">{e}</span>
                  ))}
                </div>

                {c.bio && <p className="text-sm text-slate-600 mt-2">{c.bio}</p>}
                {c.mensagem && (
                  <div className="mt-3 bg-serenity-50 p-3 rounded-xl text-sm text-slate-700">
                    <span className="text-xs text-serenity-600 font-semibold">Mensagem:</span> {c.mensagem}
                  </div>
                )}

                <div className="mt-4 flex gap-2 flex-wrap">
                  <Link to={`/profissional/${c.profissional_id}`} className="btn-ghost text-xs">
                    👤 Ver perfil
                  </Link>
                  {(c.status_candidatura === 'pendente' || c.status_candidatura === 'visualizada') && (
                    <>
                      <button onClick={() => setStatusCandidatura(c.id, 'aceita')} className="btn-primary text-xs">✓ Aceitar</button>
                      <button onClick={() => setStatusCandidatura(c.id, 'recusada')} className="btn-ghost text-xs">Recusar</button>
                    </>
                  )}
                  {c.status_candidatura === 'aceita' && (
                    <>
                      <button onClick={() => { setAvalModal({ cand: c }); setAvalNota(0); setAvalComent(''); }}
                        className="btn-secondary text-xs">⭐ Avaliar</button>
                      <button onClick={() => setChatCom({ id: c.profissional_id, nome: c.profissional_nome })}
                        className="btn-secondary text-xs">💬 Abrir chat</button>
                    </>
                  )}
                  <a href={`https://wa.me/55${c.profissional_telefone?.replace(/\D/g, '')}`}
                    target="_blank" rel="noopener" className="btn-ghost text-xs">
                    📱 WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {chatCom && <Chat outroId={chatCom.id} outroNome={chatCom.nome} onClose={() => setChatCom(null)} />}

        {/* Modal de avaliação */}
        {avalModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="card max-w-md w-full">
              <h2 className="text-lg font-semibold mb-1">Avaliar profissional</h2>
              <p className="text-sm text-slate-500 mb-4">
                Como foi a experiência com <strong>{avalModal.cand.profissional_nome}</strong>?
              </p>

              <div className="flex justify-center my-6">
                <Estrelas
                  value={avalNota}
                  size="lg"
                  showNumber={false}
                  interactive
                  onChange={setAvalNota}
                />
              </div>
              <p className="text-center text-sm text-slate-500 -mt-3 mb-4">
                {avalNota === 0 && 'Selecione uma nota'}
                {avalNota === 1 && '😞 Muito ruim'}
                {avalNota === 2 && '😐 Pode melhorar'}
                {avalNota === 3 && '🙂 Bom'}
                {avalNota === 4 && '😊 Muito bom'}
                {avalNota === 5 && '🤩 Excelente!'}
              </p>

              <label className="label">Comentário (opcional)</label>
              <textarea
                className="input min-h-[100px]"
                placeholder="Conte um pouco da sua experiência..."
                value={avalComent}
                onChange={(e) => setAvalComent(e.target.value)}
                maxLength={1000}
              />

              <div className="mt-6 flex gap-2 justify-end">
                <button onClick={() => setAvalModal(null)} className="btn-ghost">Cancelar</button>
                <button
                  onClick={enviarAvaliacao}
                  disabled={avalNota === 0}
                  className="btn-primary"
                >
                  Enviar avaliação
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Olá, {user.nome.split(' ')[0]} 👋</h1>
        <p className="text-slate-500 text-sm">Gerencie suas vagas e candidatos</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {[
          { k: 'vagas', l: `📋 Minhas vagas (${vagas.length})` },
          { k: 'nova', l: '➕ Publicar vaga' },
          { k: 'avaliacoes', l: `⭐ Avaliações${avPendentes.length ? ` (${avPendentes.length})` : ''}` }
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === t.k ? 'border-serenity-500 text-serenity-600' : 'border-transparent text-slate-500'
            }`}
          >{t.l}</button>
        ))}
      </div>

      {tab === 'vagas' && (
        loading ? <p className="text-center py-12 text-slate-400">Carregando...</p> :
        vagas.length === 0 ? (
          <div className="card text-center py-12 text-slate-500">
            Você ainda não publicou vagas. Clique em <strong>Publicar vaga</strong> acima.
          </div>
        ) : (
          <div className="space-y-3">
            {vagas.map((v) => (
              <div key={v.id} onClick={() => setVagaSel(v)}
                className="card flex items-center justify-between cursor-pointer hover:shadow-lg transition flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold">{v.profissional_desejado}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {v.regiao || '—'} • {v.jornada_horario || '—'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Publicada em {new Date(v.criado_em + 'Z').toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge-blue">👥 {v.total_candidatos} candidato{v.total_candidatos !== 1 ? 's' : ''}</span>
                  <span className={v.status === 'ativa' ? 'badge-green' : v.status === 'pausada' ? 'badge-amber' : 'badge-slate'}>
                    {v.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'nova' && (
        <div className="card max-w-3xl">
          <h2 className="text-lg font-semibold mb-4">Publicar nova vaga</h2>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Sexo do paciente</label>
                <select className="input" value={form.paciente_sexo}
                  onChange={(e) => setForm({ ...form, paciente_sexo: e.target.value as any })}>
                  <option value="">Não informar</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="label">Idade</label>
                <input className="input" type="number" value={form.paciente_idade}
                  onChange={(e) => setForm({ ...form, paciente_idade: e.target.value })} />
              </div>
              <div>
                <label className="label">Complexidade*</label>
                <select className="input" value={form.complexidade}
                  onChange={(e) => setForm({ ...form, complexidade: e.target.value as any })}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Não aceitamos alta complexidade/UTI.</p>
              </div>
            </div>

            <div>
              <label className="label">Diagnóstico / observações clínicas</label>
              <input className="input" value={form.paciente_diagnostico}
                onChange={(e) => setForm({ ...form, paciente_diagnostico: e.target.value })}
                placeholder="Ex: Alzheimer moderado" />
            </div>

            <div>
              <label className="label">Profissional desejado*</label>
              <select className="input" value={form.profissional_desejado}
                onChange={(e) => setForm({ ...form, profissional_desejado: e.target.value })}>
                <option value="">Selecione</option>
                {PROFISSIONAIS_OPCOES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Descrição do serviço* (mín. 10 caracteres)</label>
              <textarea className="input min-h-[100px]" value={form.servico_descricao}
                onChange={(e) => setForm({ ...form, servico_descricao: e.target.value })}
                placeholder="Descreva detalhadamente o serviço esperado..." />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Horário</label>
                <input className="input" value={form.jornada_horario}
                  onChange={(e) => setForm({ ...form, jornada_horario: e.target.value })}
                  placeholder="Ex: 08h às 18h" />
              </div>
              <div>
                <label className="label">Escala</label>
                <input className="input" value={form.jornada_escala}
                  onChange={(e) => setForm({ ...form, jornada_escala: e.target.value })}
                  placeholder="Ex: 12x36, Segunda a Sexta" />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Tipo de contrato</label>
                <select className="input" value={form.tipo_contrato}
                  onChange={(e) => setForm({ ...form, tipo_contrato: e.target.value as any })}>
                  <option value="">Selecione</option>
                  <option value="PJ">PJ</option>
                  <option value="CLT">CLT</option>
                </select>
              </div>
              <div>
                <label className="label">Remuneração por</label>
                <select className="input" value={form.remuneracao_tipo}
                  onChange={(e) => setForm({ ...form, remuneracao_tipo: e.target.value as any })}>
                  <option value="">Selecione</option>
                  <option value="hora">Hora</option>
                  <option value="plantao">Plantão</option>
                </select>
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" type="number" step="0.01" value={form.remuneracao_valor}
                  onChange={(e) => setForm({ ...form, remuneracao_valor: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="label">Região</label>
              <input className="input" value={form.regiao}
                onChange={(e) => setForm({ ...form, regiao: e.target.value })}
                placeholder="Ex: Zona Sul - SP" />
            </div>

            {erro && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">{erro}</div>}
            {sucesso && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm">{sucesso}</div>}

            <button onClick={publicar} className="btn-primary">Publicar vaga</button>
          </div>
        </div>
      )}

      {tab === 'avaliacoes' && (
        <div>
          {loading ? (
            <p className="text-center py-12 text-slate-400">Carregando...</p>
          ) : avPendentes.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <div className="text-4xl mb-2">⭐</div>
              <p>Nenhuma avaliação pendente.</p>
              <p className="text-xs mt-1">Quando uma vaga for encerrada, você poderá avaliar o profissional aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {avPendentes.map((p) => (
                <div key={p.candidatura_id} className="card flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold">{p.profissional_desejado}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {p.regiao || '—'} • Com <strong>{p.outro_nome}</strong>
                      {p.tipo_registro && <span className="ml-2 text-xs">({p.tipo_registro} {p.registro_conselho})</span>}
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

      <AvaliacaoModal
        pendente={avaliar}
        onClose={() => setAvaliar(null)}
        onSuccess={carregarAvPendentes}
      />
    </div>
  );
}
