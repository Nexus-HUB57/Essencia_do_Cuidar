import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import type { Vaga } from '../types';
import FavoritarBotao from '../components/FavoritarBotao';

export default function VagaDetalhe() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [vaga, setVaga] = useState<Vaga | null>(null);
  const [visualizacoes, setVisualizacoes] = useState(0);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const [candidatar, setCandidatar] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/vagas/${id}`);
        setVaga(data.vaga);
        setVisualizacoes(data.visualizacoes || 0);
      } catch (err) {
        setErro(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function enviarCandidatura() {
    setErro('');
    setSucesso('');
    try {
      await api.post('/candidaturas', { id_vaga: Number(id), mensagem });
      setSucesso('Candidatura enviada com sucesso! Você pode acompanhar pelo seu dashboard.');
      setCandidatar(false);
      toast.success('Candidatura enviada!', 'O contratante será notificado.');
    } catch (err) {
      const msg = getErrorMessage(err);
      setErro(msg);
      toast.error('Erro ao candidatar-se', msg);
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Carregando...</div>;
  if (erro && !vaga) return <div className="text-center py-20 text-rose-500">{erro}</div>;
  if (!vaga) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 fade-in">
      <Link to="/vagas" className="text-serenity-600 text-sm hover:underline">← Voltar para vagas</Link>

      <div className="card mt-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{vaga.profissional_desejado}</h1>
            <p className="text-slate-500 text-sm mt-1">
              Publicada por <strong>{vaga.contratante_nome}</strong>
            </p>
            <p className="text-xs text-slate-400 mt-1">👁️ {visualizacoes} {visualizacoes === 1 ? 'visualização' : 'visualizações'}</p>
          </div>
          <div className="flex items-center gap-2">
            <FavoritarBotao tipo="vaga" id={vaga.id} size="md" />
            <span className={vaga.complexidade === 'media' ? 'badge-amber' : 'badge-green'}>
              Complexidade {vaga.complexidade === 'media' ? 'média' : 'baixa'}
            </span>
          </div>
        </div>

        <div className="mt-6 grid sm:grid-cols-2 gap-4 text-sm">
          {vaga.regiao && (
            <div>
              <p className="text-slate-400 text-xs">Região</p>
              <p className="font-medium">📍 {vaga.regiao}</p>
            </div>
          )}
          {vaga.jornada_horario && (
            <div>
              <p className="text-slate-400 text-xs">Horário</p>
              <p className="font-medium">🕐 {vaga.jornada_horario}</p>
            </div>
          )}
          {vaga.jornada_escala && (
            <div>
              <p className="text-slate-400 text-xs">Escala</p>
              <p className="font-medium">📅 {vaga.jornada_escala}</p>
            </div>
          )}
          {vaga.tipo_contrato && (
            <div>
              <p className="text-slate-400 text-xs">Tipo de contrato</p>
              <p className="font-medium">📄 {vaga.tipo_contrato}</p>
            </div>
          )}
          {vaga.remuneracao_valor && (
            <div>
              <p className="text-slate-400 text-xs">Remuneração</p>
              <p className="font-bold text-emerald-600 text-lg">
                R$ {vaga.remuneracao_valor}
                <span className="text-xs text-slate-400 font-normal">
                  /{vaga.remuneracao_tipo === 'hora' ? 'hora' : 'plantão'}
                </span>
              </p>
            </div>
          )}
          {vaga.paciente_idade && (
            <div>
              <p className="text-slate-400 text-xs">Paciente</p>
              <p className="font-medium">
                {vaga.paciente_sexo === 'F' ? 'Feminino' : vaga.paciente_sexo === 'M' ? 'Masculino' : ''}
                {vaga.paciente_idade ? `, ${vaga.paciente_idade} anos` : ''}
              </p>
            </div>
          )}
        </div>

        {vaga.paciente_diagnostico && (
          <div className="mt-4">
            <p className="text-slate-400 text-xs">Diagnóstico / observações</p>
            <p className="text-sm">{vaga.paciente_diagnostico}</p>
          </div>
        )}

        <div className="mt-6">
          <p className="text-slate-400 text-xs mb-1">Descrição do serviço</p>
          <p className="text-sm text-slate-700 leading-relaxed">{vaga.servico_descricao}</p>
        </div>

        {user?.tipo_usuario === 'profissional' && (
          <div className="mt-8 border-t border-slate-100 pt-6">
            {sucesso && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm mb-3">
                {sucesso}
              </div>
            )}
            {erro && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm mb-3">
                {erro}
              </div>
            )}
            {!candidatar ? (
              <button onClick={() => setCandidatar(true)} className="btn-primary w-full sm:w-auto">
                Quero me candidatar
              </button>
            ) : (
              <div className="space-y-3">
                <label className="label">Mensagem para o contratante (opcional)</label>
                <textarea className="input min-h-[100px]" value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Apresente-se brevemente..." />
                <div className="flex gap-2">
                  <button onClick={() => setCandidatar(false)} className="btn-ghost">Cancelar</button>
                  <button onClick={enviarCandidatura} className="btn-primary">Enviar candidatura</button>
                </div>
              </div>
            )}
          </div>
        )}

        {!user && (
          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-slate-500 mb-3">Quer se candidatar a esta vaga?</p>
            <div className="flex justify-center gap-2">
              <Link to="/login" className="btn-ghost">Entrar</Link>
              <Link to="/cadastro?tipo=profissional" className="btn-primary">Cadastrar como profissional</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
