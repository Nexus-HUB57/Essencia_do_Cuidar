import { useEffect, useMemo, useState } from 'react';
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
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

function formatSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function validateFile(file) {
  if (!file) return 'Arquivo obrigatório';
  if (file.size > MAX_SIZE) return `Arquivo acima de 10 MB (${formatSize(file.size)})`;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
    return 'Formato não permitido (use PDF, JPG, PNG ou WEBP)';
  }
  return null;
}

export default function Register() {
  const [params] = useSearchParams();
  const initial = params.get('tipo') === 'contratante' ? 'contratante' : 'profissional';
  const [step, setStep] = useState(0);
  const [tipo, setTipo] = useState(initial);
  const [form, setForm] = useState({
    nome: '', email: '', senha: '', telefone: '',
    // profissional
    registro_conselho: '',
    diploma: null,             // File object
    registro_conselho_doc: null, // File object
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

  // Validação por passo
  const errors = useMemo(() => {
    const e = {};
    if (step === 1) {
      if (!form.nome) e.nome = 'Informe seu nome completo';
      if (!form.email) e.email = 'Informe seu e-mail';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'E-mail inválido';
      if (!form.senha) e.senha = 'Crie uma senha';
      else if (form.senha.length < 6) e.senha = 'Mínimo 6 caracteres';
      if (!form.telefone || form.telefone.replace(/\D/g, '').length < 10) e.telefone = 'Informe DDD + número';
    }
    if (step === 2 && tipo === 'profissional') {
      if (!form.registro_conselho) e.registro_conselho = 'Informe o número do conselho';
      if (form.especialidades.length === 0) e.especialidades = 'Selecione ao menos uma';
      if (validateFile(form.diploma)) e.diploma = validateFile(form.diploma);
      if (validateFile(form.registro_conselho_doc)) e.registro_conselho_doc = validateFile(form.registro_conselho_doc);
    }
    if (step === 3 && tipo === 'profissional') {
      if (form.periodos.length === 0) e.periodos = 'Selecione ao menos um período';
      if (form.dias.length === 0) e.dias = 'Selecione ao menos um dia';
    }
    return e;
  }, [step, form, tipo]);

  function next() {
    setErro('');
    if (Object.keys(errors).length > 0) {
      const first = Object.values(errors)[0];
      return setErro(first);
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
        payload.registro_conselho = form.registro_conselho;
        payload.especialidades = form.especialidades;
        payload.disponibilidade = { periodos: form.periodos, dias: form.dias };
        payload.diploma = form.diploma;
        payload.registro_conselho_doc = form.registro_conselho_doc;
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
              <p className="text-sm text-brand-slate">Informações básicas de contato e acesso.</p>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Nome completo *</label>
                  <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} required />
                  {errors.nome && <p className="mt-1 text-xs text-rose-600">{errors.nome}</p>}
                </div>
                <div>
                  <label className="label">E-mail *</label>
                  <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} required />
                  {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email}</p>}
                </div>
                <div>
                  <label className="label">Senha * <span className="text-brand-slate font-normal">(mín. 6 caracteres)</span></label>
                  <input type="password" className="input" value={form.senha} onChange={e => set('senha', e.target.value)} minLength={6} required />
                  {errors.senha && <p className="mt-1 text-xs text-rose-600">{errors.senha}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Contato / WhatsApp *</label>
                  <input className="input" value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-9999" required />
                  {errors.telefone && <p className="mt-1 text-xs text-rose-600">{errors.telefone}</p>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && tipo === 'profissional' && (
            <div>
              <h2 className="text-lg font-semibold">Sua qualificação</h2>
              <p className="text-sm text-brand-slate">Para manter a segurança da plataforma, exigimos o registro no conselho e o diploma.</p>

              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Número de Registro no Conselho *</label>
                  <input className="input" value={form.registro_conselho} onChange={e => set('registro_conselho', e.target.value)} placeholder="Ex: COREN-SP 123456" />
                  <p className="mt-1 text-xs text-brand-slate">COREN, CRM, CREFITO, CRP, etc.</p>
                  {errors.registro_conselho && <p className="mt-1 text-xs text-rose-600">{errors.registro_conselho}</p>}
                </div>

                <FileField
                  label="Diploma / Certificado *"
                  file={form.diploma}
                  onChange={f => set('diploma', f)}
                  error={errors.diploma}
                />
                <FileField
                  label="Registro no Conselho (comprovante) *"
                  file={form.registro_conselho_doc}
                  onChange={f => set('registro_conselho_doc', f)}
                  error={errors.registro_conselho_doc}
                />

                <div className="sm:col-span-2">
                  <label className="label">Especializações *</label>
                  <div className="flex flex-wrap gap-2">
                    {ESPECIALIDADES.map(e => (
                      <Chip key={e} active={form.especialidades.includes(e)} onClick={() => set('especialidades', toggle(form.especialidades, e))}>{e}</Chip>
                    ))}
                  </div>
                  {errors.especialidades && <p className="mt-1 text-xs text-rose-600">{errors.especialidades}</p>}
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
                <label className="label">Períodos *</label>
                <div className="flex flex-wrap gap-2">
                  {PERIODOS.map(p => (
                    <Chip key={p.v} active={form.periodos.includes(p.v)} onClick={() => set('periodos', toggle(form.periodos, p.v))}>{p.t}</Chip>
                  ))}
                </div>
                {errors.periodos && <p className="mt-1 text-xs text-rose-600">{errors.periodos}</p>}
              </div>
              <div className="mt-4">
                <label className="label">Dias da semana *</label>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map(d => (
                    <Chip key={d.v} active={form.dias.includes(d.v)} onClick={() => set('dias', toggle(form.dias, d.v))}>{d.t}</Chip>
                  ))}
                </div>
                {errors.dias && <p className="mt-1 text-xs text-rose-600">{errors.dias}</p>}
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
                <li><b>Contato/WhatsApp:</b> {form.telefone || '—'}</li>
                {tipo === 'profissional' && <>
                  <li><b>Registro:</b> {form.registro_conselho}</li>
                  <li>
                    <b>Diploma:</b>{' '}
                    {form.diploma ? <span className="text-emerald-700">{form.diploma.name} ({formatSize(form.diploma.size)})</span> : <span className="text-rose-600">faltando</span>}
                  </li>
                  <li>
                    <b>Doc. Conselho:</b>{' '}
                    {form.registro_conselho_doc ? <span className="text-emerald-700">{form.registro_conselho_doc.name} ({formatSize(form.registro_conselho_doc.size)})</span> : <span className="text-rose-600">faltando</span>}
                  </li>
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
              : <button onClick={submit} disabled={loading} className="btn-primary disabled:opacity-60">{loading ? 'Enviando documentos…' : 'Finalizar cadastro'}</button>
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

function FileField({ label, file, onChange, error }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-3 ${error ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 hover:border-brand-blue/40'}`}>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-brand-slate file:mr-3 file:rounded-lg file:border-0 file:bg-brand-blue file:px-3 file:py-2 file:text-white file:cursor-pointer"
          onChange={e => onChange(e.target.files?.[0] || null)}
        />
        {file && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-rose-600 hover:underline">remover</button>
        )}
      </div>
      {file
        ? <p className="mt-1 text-xs text-emerald-700">✓ {file.name} · {formatSize(file.size)}</p>
        : <p className="mt-1 text-xs text-brand-slate">PDF, JPG, PNG ou WEBP · até 10 MB</p>
      }
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
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
