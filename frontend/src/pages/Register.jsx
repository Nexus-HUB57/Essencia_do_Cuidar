import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ESPECIALIDADES = [
  'Alzheimer', 'Cuidados Paliativos', 'Pós-operatório', 'Geriatria',
  'Demência', 'Acamados', 'Mobilidade Reduzida', 'Reabilitação',
  'Saúde Mental', 'Nutrição Clínica',
];
const PERIODOS = [
  { v: 'manha', t: 'Manhã' }, { v: 'tarde', t: 'Tarde' }, { v: 'noite', t: 'Noite' },
  { v: '12h', t: '12h' }, { v: '24h', t: '24h' },
];
const DIAS = [
  { v: 'seg', t: 'Seg' }, { v: 'ter', t: 'Ter' }, { v: 'qua', t: 'Qua' },
  { v: 'qui', t: 'Qui' }, { v: 'sex', t: 'Sex' }, { v: 'sab', t: 'Sáb' }, { v: 'dom', t: 'Dom' },
];

export default function Register() {
  const [params] = useSearchParams();
  const initial = params.get('tipo') === 'contratante' ? 'contratante' : 'profissional';
  const [step, setStep] = useState(0);
  const [tipo, setTipo] = useState(initial);
  const [form, setForm] = useState({
    nome: '', email: '', senha: '', telefone: '',
    // profissional
    diploma_nome: '', registro_conselho: '',
    especialidades: [],
    periodos: [], dias: [],
    // contratante
    empresa: '',
  });
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { setTipo(initial); }, [initial]);

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }
  function toggle(arr, v) { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

  function next() {
    setErro('');
    if (step === 0) {
      if (!tipo) return setErro('Escolha um tipo de cadastro.');
    }
    if (step === 1) {
      if (!form.nome || !form.email || !form.senha) return setErro('Preencha nome, e-mail e senha.');
      if (form.senha.length < 6) return setErro('Senha deve ter ao menos 6 caracteres.');
    }
    if (step === 2 && tipo === 'profissional') {
      if (!form.registro_conselho) return setErro('Informe o número de registro do conselho (COREN, CRM, etc.).');
      if (form.especialidades.length === 0) return setErro('Selecione ao menos uma especialização.');
    }
    setStep(s => s + 1);
  }
  function back() { setStep(s => Math.max(0, s - 1)); }

  async function submit() {
    setErro(''); setLoading(true);
    try {
      const payload = {
        tipo_usuario: tipo,
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        telefone: form.telefone,
      };
      if (tipo === 'profissional') {
        payload.detalhes = {
          diploma_url: form.diploma_nome ? `local:${form.diploma_nome}` : null,
          registro_conselho: form.registro_conselho,
          especialidades: form.especialidades,
          disponibilidade: { periodos: form.periodos, dias: form.dias },
        };
      }
      const u = await register(payload);
      navigate(u.tipo_usuario === 'profissional' ? '/dashboard-profissional' : '/dashboard-contratante', { replace: true });
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="container-page py-10 sm:py-14">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Criar conta</h1>
        <p className="mt-1 text-sm text-brand-slate">Vamos guiar você em alguns passos.</p>

        <Stepper current={step} tipo={tipo} />

        <div className="card mt-6">
          {step === 0 && (
            <div>
              <h2 className="text-lg font-semibold">Qual é o seu objetivo?</h2>
              <p className="text-sm text-brand-slate">Você pode mudar isso depois, mas define como sua conta começa.</p>
              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <TipoOption
                  active={tipo === 'profissional'}
                  onClick={() => setTipo('profissional')}
                  title="Sou Profissional"
                  desc="Quero encontrar vagas de atendimento domiciliar."
                />
                <TipoOption
                  active={tipo === 'contratante'}
                  onClick={() => setTipo('contratante')}
                  title="Busco Profissional (+Saúde)"
                  desc="Quero contratar um profissional para um paciente."
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold">Seus dados</h2>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Nome completo</label>
                  <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} required />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Senha</label>
                  <input type="password" className="input" value={form.senha} onChange={e => set('senha', e.target.value)} minLength={6} required />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Telefone / WhatsApp</label>
                  <input className="input" value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && tipo === 'profissional' && (
            <div>
              <h2 className="text-lg font-semibold">Sua qualificação</h2>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Registro Profissional</label>
                  <input className="input" value={form.registro_conselho} onChange={e => set('registro_conselho', e.target.value)} placeholder="Ex: COREN-SP 123456" />
                </div>
                <div>
                  <label className="label">Diploma (PDF/JPG) — opcional na demo</label>
                  <input type="file" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-blue/10 file:px-3 file:py-1.5 file:text-brand-blue"
                    onChange={e => set('diploma_nome', e.target.files?.[0]?.name || '')} />
                  {form.diploma_nome && <p className="mt-1 text-xs text-brand-slate">{form.diploma_nome}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Especializações</label>
                  <div className="flex flex-wrap gap-2">
                    {ESPECIALIDADES.map(e => (
                      <Chip key={e} active={form.especialidades.includes(e)} onClick={() => set('especialidades', toggle(form.especialidades, e))}>{e}</Chip>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && tipo === 'contratante' && (
            <div>
              <h2 className="text-lg font-semibold">Sobre você</h2>
              <div className="mt-4">
                <label className="label">Você está representando (opcional)</label>
                <input className="input" value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Família, clínica ou instituição" />
              </div>
              <p className="mt-4 text-sm text-brand-slate">Depois do cadastro você poderá publicar vagas de baixa e média complexidade.</p>
            </div>
          )}

          {step === 3 && tipo === 'profissional' && (
            <div>
              <h2 className="text-lg font-semibold">Sua disponibilidade</h2>
              <p className="text-sm text-brand-slate">Selecione os períodos e dias em que você pode atender.</p>
              <div className="mt-4">
                <label className="label">Períodos</label>
                <div className="flex flex-wrap gap-2">
                  {PERIODOS.map(p => (
                    <Chip key={p.v} active={form.periodos.includes(p.v)} onClick={() => set('periodos', toggle(form.periodos, p.v))}>{p.t}</Chip>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <label className="label">Dias da semana</label>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map(d => (
                    <Chip key={d.v} active={form.dias.includes(d.v)} onClick={() => set('dias', toggle(form.dias, d.v))}>{d.t}</Chip>
                  ))}
                </div>
              </div>
            </div>
          )}

          {((step === 4 && tipo === 'profissional') || (step === 3 && tipo === 'contratante')) && (
            <div>
              <h2 className="text-lg font-semibold">Tudo certo?</h2>
              <p className="text-sm text-brand-slate">Revise rapidamente e finalize seu cadastro.</p>
              <ul className="mt-4 text-sm text-brand-ink/80 space-y-1">
                <li><b>Nome:</b> {form.nome}</li>
                <li><b>E-mail:</b> {form.email}</li>
                <li><b>Telefone:</b> {form.telefone || '—'}</li>
                {tipo === 'profissional' && <>
                  <li><b>Registro:</b> {form.registro_conselho}</li>
                  <li><b>Especialidades:</b> {form.especialidades.join(', ') || '—'}</li>
                  <li><b>Disponibilidade:</b> {form.periodos.join(', ') || '—'} · {form.dias.join(', ') || '—'}</li>
                </>}
              </ul>
            </div>
          )}

          {erro && <p className="mt-4 text-sm text-rose-600">{erro}</p>}

          <div className="mt-6 flex items-center justify-between">
            <button onClick={back} disabled={step === 0} className="btn-ghost disabled:opacity-40">Voltar</button>
            {step < (tipo === 'profissional' ? 4 : 3)
              ? <button onClick={next} className="btn-primary">Continuar</button>
              : <button onClick={submit} disabled={loading} className="btn-primary disabled:opacity-60">{loading ? 'Criando…' : 'Finalizar cadastro'}</button>
            }
          </div>
        </div>

        <p className="mt-4 text-sm text-brand-slate text-center">
          Já tem conta? <Link to="/login" className="text-brand-blue font-medium">Entrar</Link>
        </p>
      </div>
    </section>
  );
}

function Stepper({ current, tipo }) {
  const steps = tipo === 'profissional'
    ? ['Tipo', 'Dados', 'Qualificação', 'Disponibilidade', 'Confirmar']
    : ['Tipo', 'Dados', 'Sobre', 'Confirmar'];
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`h-6 w-6 grid place-items-center rounded-full font-semibold ${i <= current ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
          <span className={i === current ? 'font-medium text-brand-ink' : 'text-brand-slate'}>{s}</span>
          {i < steps.length - 1 && <span className="w-4 h-px bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

function TipoOption({ active, onClick, title, desc }) {
  return (
    <button type="button" onClick={onClick} className={`text-left rounded-2xl border-2 p-5 transition ${active ? 'border-brand-blue bg-brand-blue/5' : 'border-slate-200 hover:border-brand-blue/40'}`}>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-brand-slate mt-1">{desc}</p>
    </button>
  );
}

function Chip({ active, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-sm border transition ${active ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-brand-ink border-slate-200 hover:border-brand-blue/40'}`}>
      {children}
    </button>
  );
}
