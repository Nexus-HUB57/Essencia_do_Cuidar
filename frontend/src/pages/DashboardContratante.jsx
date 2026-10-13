import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Section, EmptyState, Spinner } from '../components/UI.jsx';

const emptyVaga = {
  paciente_sexo: '', paciente_idade: '', paciente_diagnostico: '',
  complexidade: 'baixa',
  servico_descricao: '', profissional_desejado: '',
  jornada_horario: '', jornada_escala: '',
  tipo_contrato: 'CLT', remuneracao_tipo: 'hora', remuneracao_valor: '',
  regiao: '',
};

export default function DashboardContratante() {
  const { user } = useAuth();
  const [vagas, setVagas] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyVaga);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setVagas(await api.minhasVagas()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function publicar(e) {
    e.preventDefault();
    setErro('');
    try {
      const payload = { ...form, paciente_idade: form.paciente_idade ? Number(form.paciente_idade) : null, remuneracao_valor: form.remuneracao_valor ? Number(form.remuneracao_valor) : null };
      await api.criarVaga(payload);
      setForm(emptyVaga);
      setShowForm(false);
      await load();
    } catch (e2) { setErro(e2.message); }
  }

  async function mudarStatus(v, status) {
    await api.mudarStatusVaga(v.id, status);
    load();
  }

  return (
    <>
      <Section
        title={`Olá, ${user.nome.split(' ')[0]}`}
        subtitle="Publique vagas e acompanhe candidatos."
        action={
          <button onClick={() => setShowForm(s => !s)} className="btn-primary text-sm">
            {showForm ? 'Cancelar' : '+ Nova vaga'}
          </button>
        }
      >
        {showForm && (
          <form onSubmit={publicar} className="card mb-6">
            <h3 className="font-semibold">Publicar nova vaga</h3>
            <p className="text-xs text-brand-slate">Apenas baixa e média complexidade — alta complexidade / UTI não é aceita.</p>

            <fieldset className="mt-4">
              <legend className="label">Paciente</legend>
              <div className="grid sm:grid-cols-3 gap-3">
                <select className="input" value={form.paciente_sexo} onChange={e => setForm({ ...form, paciente_sexo: e.target.value })}>
                  <option value="">Sexo</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                  <option value="Outro">Outro</option>
                </select>
                <input className="input" type="number" min="0" max="120" placeholder="Idade" value={form.paciente_idade} onChange={e => setForm({ ...form, paciente_idade: e.target.value })} />
                <select className="input" value={form.complexidade} onChange={e => setForm({ ...form, complexidade: e.target.value })}>
                  <option value="baixa">Baixa complexidade</option>
                  <option value="media">Média complexidade</option>
                </select>
                <input className="input sm:col-span-3" placeholder="Diagnóstico (texto livre)" value={form.paciente_diagnostico} onChange={e => setForm({ ...form, paciente_diagnostico: e.target.value })} />
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="label">Serviço</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <textarea className="input sm:col-span-2" rows="3" placeholder="Descreva o serviço a ser prestado" value={form.servico_descricao} onChange={e => setForm({ ...form, servico_descricao: e.target.value })} required />
                <input className="input sm:col-span-2" placeholder="Profissional desejado (Ex: Técnico de Enfermagem)" value={form.profissional_desejado} onChange={e => setForm({ ...form, profissional_desejado: e.target.value })} />
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="label">Jornada e contrato</legend>
              <div className="grid sm:grid-cols-3 gap-3">
                <input className="input" placeholder="Horário (Ex: 08h às 20h)" value={form.jornada_horario} onChange={e => setForm({ ...form, jornada_horario: e.target.value })} />
                <input className="input" placeholder="Escala (Ex: 12x36)" value={form.jornada_escala} onChange={e => setForm({ ...form, jornada_escala: e.target.value })} />
                <select className="input" value={form.tipo_contrato} onChange={e => setForm({ ...form, tipo_contrato: e.target.value })}>
                  <option value="CLT">CLT</option>
                  <option value="PJ">PJ</option>
                </select>
                <select className="input" value={form.remuneracao_tipo} onChange={e => setForm({ ...form, remuneracao_tipo: e.target.value })}>
                  <option value="hora">Por hora</option>
                  <option value="plantao">Por plantão</option>
                </select>
                <input className="input" type="number" min="0" step="0.01" placeholder="Valor (R$)" value={form.remuneracao_valor} onChange={e => setForm({ ...form, remuneracao_valor: e.target.value })} />
                <input className="input" placeholder="Região (Ex: Zona Sul - SP)" value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} />
              </div>
            </fieldset>

            {erro && <p className="mt-3 text-sm text-rose-600">{erro}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancelar</button>
              <button type="submit" className="btn-primary">Publicar vaga</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center text-brand-slate py-12"><Spinner /> Carregando…</div>
        ) : vagas.length === 0 ? (
          <EmptyState
            title="Você ainda não tem vagas"
            description="Clique em '+ Nova vaga' para publicar a primeira."
            action={<button onClick={() => setShowForm(true)} className="btn-primary">+ Nova vaga</button>}
          />
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {vagas.map(v => (
              <li key={v.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/vagas/${v.id}`} className="font-semibold hover:text-brand-blue">{v.profissional_desejado || 'Vaga'}</Link>
                  <span className={v.status === 'ativa' ? 'badge-green' : v.status === 'pausada' ? 'badge-amber' : 'badge-rose'}>{v.status}</span>
                </div>
                <p className="mt-1 text-sm text-brand-slate line-clamp-2">{v.servico_descricao}</p>
                <ul className="mt-3 text-xs text-brand-slate space-y-0.5">
                  <li>{v.paciente_sexo} · {v.paciente_idade} anos · {v.paciente_diagnostico || 's/ diagnóstico'}</li>
                  <li>Complexidade: {v.complexidade}</li>
                  <li>{v.regiao} · {v.tipo_contrato} · R$ {v.remuneracao_valor} {v.remuneracao_tipo === 'hora' ? '/h' : '/plantão'}</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/vagas/${v.id}/candidatos`} className="btn-secondary text-sm">Ver candidatos</Link>
                  {v.status === 'ativa' && <button onClick={() => mudarStatus(v, 'pausada')} className="btn-ghost text-sm">Pausar</button>}
                  {v.status === 'pausada' && <button onClick={() => mudarStatus(v, 'ativa')} className="btn-ghost text-sm">Reativar</button>}
                  {v.status !== 'fechada' && <button onClick={() => mudarStatus(v, 'fechada')} className="btn-danger text-sm">Encerrar</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
