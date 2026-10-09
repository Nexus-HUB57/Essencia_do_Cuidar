import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import api from '../utils/api';
import Wizard from '../components/Wizard';

type Tipo = 'profissional' | 'contratante';

const ESPECIALIDADES = [
  'Idosos', 'Alzheimer', 'Cuidados Paliativos', 'Pós-operatório',
  'Geriatria', 'Fisioterapia', 'Psicologia', 'Acompanhamento Familiar',
  'Diabetes', 'Hipertensão', 'Mobilidade Reduzida', 'Acamados'
];

const DISPONIBILIDADES = [
  { v: 'manha', l: 'Manhã' },
  { v: 'tarde', l: 'Tarde' },
  { v: 'noite', l: 'Noite' },
  { v: '12h',   l: 'Turno 12h' },
  { v: '24h',   l: 'Plantão 24h' }
];

function Toggle({ options, value, onChange }: any) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o: any) => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        const ativo = Array.isArray(value) ? value.includes(v) : value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (Array.isArray(value)) {
                onChange(ativo ? value.filter((x: string) => x !== v) : [...value, v]);
              } else {
                onChange(v);
              }
            }}
            className={[
              'px-3 py-1.5 rounded-full text-sm border transition',
              ativo
                ? 'bg-serenity-500 text-white border-serenity-500'
                : 'bg-white text-slate-600 border-slate-200 hover:border-serenity-300'
            ].join(' ')}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export default function Cadastro() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { cadastro, user } = useAuth();
  const [tipo, setTipo] = useState<Tipo>((params.get('tipo') as Tipo) || 'contratante');
  const [step, setStep] = useState(0);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  // Form comum
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');

  // Profissional
  const [registro, setRegistro] = useState('');
  const [tipoRegistro, setTipoRegistro] = useState('');
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [disponibilidade, setDisponibilidade] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [diploma, setDiploma] = useState<File | null>(null);

  useEffect(() => {
    if (user) {
      navigate(user.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante');
    }
  }, [user]);

  function validarStepAtual(): string | null {
    if (step === 0) {
      if (nome.trim().length < 2) return 'Nome completo é obrigatório';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido';
      if (senha.length < 6) return 'Senha deve ter no mínimo 6 caracteres';
    }
    if (tipo === 'profissional' && step === 1) {
      if (registro && !tipoRegistro) return 'Selecione o tipo de registro (CRM, COREN, etc.)';
      if (especialidades.length === 0) return 'Selecione ao menos uma especialidade';
      if (disponibilidade.length === 0) return 'Selecione ao menos uma disponibilidade';
    }
    return null;
  }

  function proximo() {
    const e = validarStepAtual();
    if (e) { setErro(e); return; }
    setErro('');
    setStep((s) => s + 1);
  }

  async function finalizar() {
    const e = validarStepAtual();
    if (e) { setErro(e); return; }
    setErro('');
    setLoading(true);
    try {
      // 1) Cadastro
      const novoUser = await cadastro({
        tipo_usuario: tipo,
        nome: nome.trim(),
        email: email.trim(),
        senha,
        telefone: telefone || undefined
      });

      // 2) Se profissional, atualiza perfil e sobe diploma
      if (tipo === 'profissional') {
        await api.put('/profissionais/me', {
          registro_conselho: registro || undefined,
          tipo_registro: tipoRegistro || undefined,
          especialidades,
          disponibilidade,
          bio: bio || undefined
        });
        if (diploma) {
          const fd = new FormData();
          fd.append('diploma', diploma);
          await api.post('/profissionais/me/diploma', fd, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      }
      navigate(novoUser.tipo_usuario === 'profissional'
        ? '/dashboard/profissional'
        : '/dashboard/contratante');
    } catch (err) {
      setErro(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const stepsProfissional = [
    { label: 'Dados' },
    { label: 'Perfil' },
    { label: 'Diploma' }
  ];
  const stepsContratante = [
    { label: 'Dados' }
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 fade-in">
      {/* Toggle do tipo */}
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Crie sua conta</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Já tem conta?{' '}
          <Link to="/login" className="text-serenity-600 font-medium hover:underline">Entrar</Link>
        </p>
        <div className="mt-6 inline-flex p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setTipo('contratante'); setStep(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tipo === 'contratante' ? 'bg-white text-serenity-600 shadow-soft' : 'text-slate-500'
            }`}
          >
            🏠 Busco profissional (+Saúde)
          </button>
          <button
            onClick={() => { setTipo('profissional'); setStep(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tipo === 'profissional' ? 'bg-white text-emerald-600 shadow-soft' : 'text-slate-500'
            }`}
          >
            🩺 Sou profissional
          </button>
        </div>
      </div>

      <div className="card">
        <Wizard steps={tipo === 'profissional' ? stepsProfissional : stepsContratante} current={step}>
          {/* STEP 0 — Dados pessoais */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold mb-1">Dados pessoais</h2>
              <div>
                <label className="label">Nome completo</label>
                <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Silva" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">E-mail</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
                </div>
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div>
                <label className="label">Senha (mín. 6 caracteres)</label>
                <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
          )}

          {/* STEP 1 — Perfil profissional */}
          {step === 1 && tipo === 'profissional' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold mb-1">Perfil profissional</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Tipo de registro</label>
                  <select className="input" value={tipoRegistro} onChange={(e) => setTipoRegistro(e.target.value)}>
                    <option value="">Selecione</option>
                    <option value="CRM">CRM (Medicina)</option>
                    <option value="COREN">COREN (Enfermagem)</option>
                    <option value="CREFITO">CREFITO (Fisioterapia/TO)</option>
                    <option value="CRP">CRP (Psicologia)</option>
                    <option value="CRN">CRN (Nutrição)</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="label">Número do registro</label>
                  <input className="input" value={registro} onChange={(e) => setRegistro(e.target.value)} placeholder="Ex: COREN-SP 123456" />
                </div>
              </div>
              <div>
                <label className="label">Especialidades</label>
                <Toggle options={ESPECIALIDADES} value={especialidades} onChange={setEspecialidades} />
                <p className="text-xs text-slate-400 mt-1">Selecione uma ou mais tags.</p>
              </div>
              <div>
                <label className="label">Disponibilidade</label>
                <Toggle options={DISPONIBILIDADES} value={disponibilidade} onChange={setDisponibilidade} />
              </div>
              <div>
                <label className="label">Sobre você (opcional)</label>
                <textarea className="input min-h-[100px]" value={bio} onChange={(e) => setBio(e.target.value)}
                  placeholder="Conte um pouco da sua experiência..." />
              </div>
            </div>
          )}

          {/* STEP 2 — Diploma (somente profissional) */}
          {step === 2 && tipo === 'profissional' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold mb-1">Diploma / certificado</h2>
              <p className="text-sm text-slate-500">
                Faça upload do seu diploma ou certificado (PDF, JPG ou PNG — até 5 MB).
                Documentos passam por verificação antes de exibir o selo de confiança.
              </p>
              <div>
                <label className="label">Arquivo</label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setDiploma(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl
                             file:border-0 file:font-medium file:bg-serenity-50 file:text-serenity-700
                             hover:file:bg-serenity-100"
                />
                {diploma && (
                  <p className="text-xs text-emerald-600 mt-2">✓ {diploma.name}</p>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                ⚠️ O diploma é obrigatório para exibir o selo de verificação. Você pode continuar
                sem e enviar depois pelo seu dashboard.
              </div>
            </div>
          )}

          {erro && (
            <div className="mt-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-xl">
              {erro}
            </div>
          )}

          {/* Navegação */}
          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? (
              <button onClick={() => { setErro(''); setStep((s) => s - 1); }} className="btn-ghost">
                ← Voltar
              </button>
            ) : <span />}
            {step < (tipo === 'profissional' ? 2 : 0) ? (
              <button onClick={proximo} className="btn-primary">Próximo →</button>
            ) : (
              <button onClick={finalizar} disabled={loading} className="btn-primary">
                {loading ? 'Salvando...' : 'Criar conta'}
              </button>
            )}
          </div>
        </Wizard>
      </div>
    </div>
  );
}
