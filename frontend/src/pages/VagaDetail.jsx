import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from '../components/UI.jsx';

export default function VagaDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [vaga, setVaga] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jaCandidatado, setJaCandidatado] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getVaga(id),
      user?.tipo_usuario === 'profissional' ? api.minhasCandidaturas().catch(() => []) : Promise.resolve([]),
    ]).then(([v, cs]) => {
      setVaga(v);
      setJaCandidatado(cs.some(c => c.id_vaga === Number(id)));
    }).catch(e => setMsg(e.message)).finally(() => setLoading(false));
  }, [id, user]);

  async function candidatar() {
    const texto = prompt('Mensagem para o contratante (opcional):', 'Olá! Tenho interesse na vaga.') ?? '';
    if (texto === null) return;
    try {
      await api.candidatar({ id_vaga: Number(id), mensagem: texto || undefined });
      setJaCandidatado(true);
      alert('Candidatura enviada! O contratante será notificado.');
    } catch (e) { alert(e.message); }
  }

  if (loading) return <div className="container-page py-16 text-center"><Spinner /></div>;
  if (!vaga) return <div className="container-page py-16 text-center text-rose-600">{msg || 'Vaga não encontrada'}</div>;

  const podeCandidatar = user?.tipo_usuario === 'profissional' && vaga.status === 'ativa' && !jaCandidatado;
  const isContratante = user?.tipo_usuario === 'contratante' && user.id === vaga.id_contratante;

  return (
    <section className="container-page py-10 sm:py-14">
      <Link to={user?.tipo_usuario === 'contratante' ? '/dashboard-contratante' : '/dashboard-profissional'} className="text-sm text-brand-blue">← Voltar</Link>

      <div className="mt-4 grid lg:grid-cols-3 gap-6">
        <article className="card lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{vaga.profissional_desejado || 'Vaga'}</h1>
            <span className={vaga.complexidade === 'baixa' ? 'badge-green' : 'badge-amber'}>{vaga.complexidade === 'baixa' ? 'Baixa complexidade' : 'Média complexidade'}</span>
          </div>
          <p className="mt-1 text-sm text-brand-slate">Publicada por {vaga.contratante_nome} · {new Date(vaga.criado_em).toLocaleDateString('pt-BR')}</p>

          <div className="mt-6">
            <h3 className="font-semibold">Serviço</h3>
            <p className="mt-1 text-brand-ink/80 whitespace-pre-line">{vaga.servico_descricao}</p>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold">Paciente</h3>
            <ul className="mt-1 text-sm text-brand-ink/80 space-y-0.5">
              <li>Sexo: {vaga.paciente_sexo || '—'}</li>
              <li>Idade: {vaga.paciente_idade || '—'}</li>
              <li>Diagnóstico: {vaga.paciente_diagnostico || '—'}</li>
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold">Jornada e contrato</h3>
            <ul className="mt-1 text-sm text-brand-ink/80 space-y-0.5">
              <li>Horário: {vaga.jornada_horario || '—'}</li>
              <li>Escala: {vaga.jornada_escala || '—'}</li>
              <li>Contrato: {vaga.tipo_contrato || '—'}</li>
              <li>Remuneração: {vaga.remuneracao_valor ? `R$ ${vaga.remuneracao_valor} ${vaga.remuneracao_tipo === 'hora' ? '/h' : '/plantão'}` : '—'}</li>
              <li>Região: {vaga.regiao || '—'}</li>
            </ul>
          </div>
        </article>

        <aside className="card">
          <h3 className="font-semibold">Ações</h3>
          <div className="mt-4 space-y-2">
            {podeCandidatar && <button onClick={candidatar} className="btn-primary w-full">Candidatar-se</button>}
            {jaCandidatado && <span className="badge-green">✓ Você já se candidatou</span>}
            {isContratante && <Link to={`/vagas/${vaga.id}/candidatos`} className="btn-secondary w-full">Ver candidatos</Link>}
            {isContratante && <Link to={`/vagas/${vaga.id}/chat`} className="btn-ghost w-full">Abrir chat</Link>}
            {!user && <Link to="/login" className="btn-primary w-full">Entrar para candidatar</Link>}
          </div>
          <p className="mt-4 text-xs text-brand-slate">
            Toda candidatura dispara uma notificação ao contratante. Mantemos histórico de mensagens no chat da vaga.
          </p>
        </aside>
      </div>
    </section>
  );
}
