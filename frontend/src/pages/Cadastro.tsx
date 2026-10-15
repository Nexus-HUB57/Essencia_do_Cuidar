import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import Wizard from '../components/Wizard';
import api from '../utils/api';
import { useTranslation } from 'react-i18next';

const ESPECIALIDADES_OPCOES = [
  'Idosos', 'Alzheimer', 'Cuidados Paliativos', 'Pós-operatório',
  'Geriatria', 'Fisioterapia', 'Psicologia', 'Acompanhamento Familiar', 'Nutrição'
];
const DISPONIBILIDADE_OPCOES = [
  { v: 'manha', l: 'Manhã' },
  { v: 'tarde', l: 'Tarde' },
  { v: 'noite', l: 'Noite' },
  { v: '12h', l: '12h' },
  { v: '24h', l: '24h' }
];
const TIPO_REGISTRO_OPCOES = [
  { v: 'CRM', l: 'CRM (Medicina)' },
  { v: 'COREN', l: 'COREN (Enfermagem)' },
  { v: 'CREFITO', l: 'CREFITO (Fisioterapia)' },
  { v: 'CRP', l: 'CRP (Psicologia)' },
  { v: 'CRN', l: 'CRN (Nutrição)' },
  { v: 'OUTRO', l: 'Outro' }
];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function Cadastro() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { cadastro } = useAuth();

  const tipoInicial = (params.get('tipo') as 'profissional' | 'contratante') || 'contratante';
  const [step, setStep] = useState(0);
  const [tipo, setTipo] = useState<'profissional' | 'contratante'>(tipoInicial);
  const [form, setForm] = useState({
    nome: '', email: '', senha: '', telefone: '',
    tipo_registro: '', registro_conselho: '', uf: '',
    especialidades: [] as string[], disponibilidade: [] as string[], bio: ''
  });
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const steps = tipo === 'profissional'
    ? [
        { label: t('auth.chooseProfile') },
        { label: t('auth.register') },
        { label: t('perfil.registro') },
        { label: t('perfil.especialidades') }
      ]
    : [
        { label: t('auth.chooseProfile') },
        { label: t('auth.register') }
      ];

  function toggleList(field: 'especialidades' | 'disponibilidade', v: string) {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(v) ? prev[field].filter(x => x !== v) : [...prev[field], v]
    }));
  }

  async function submit() {
    setErro('');
    setLoading(true);
    try {
      const payload: any = {
        tipo_usuario: tipo,
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        telefone: form.telefone
      };
      const u = await cadastro(payload);
      // Se profissional, atualiza perfil com registro/especialidades
      if (tipo === 'profissional') {
        await api.put('/profissionais/me', {
          tipo_registro: form.tipo_registro,
          registro_conselho: form.registro_conselho,
          uf: form.uf,
          especialidades: form.especialidades,
          disponibilidade: form.disponibilidade,
          bio: form.bio
        });
      }
      navigate(u.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante');
    } catch (e) {
      setErro(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 fade-in">
      <h1 className="text-2xl font-bold text-center mb-6">{t('auth.register')}</h1>
      <div className="card">
        <Wizard steps={steps} current={step}>
          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { v: 'contratante', i: '🏠', t: t('auth.contractor'), d: 'Famílias e clínicas que contratam.' },
                { v: 'profissional', i: '🩺', t: t('auth.professional'), d: 'Cuidadores, enfermeiros, fisioterapeutas...' }
              ].map((o) => (
                <button key={o.v} onClick={() => setTipo(o.v as any)}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    tipo === o.v ? 'border-serenity-500 bg-serenity-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <div className="text-3xl mb-2">{o.i}</div>
                  <p className="font-semibold">{o.t}</p>
                  <p className="text-xs text-slate-500 mt-1">{o.d}</p>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="label">{t('auth.name')}</label>
                <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('auth.email')}</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('auth.password')}</label>
                <input className="input" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">Mínimo 6 caracteres</p>
              </div>
              <div>
                <label className="label">{t('auth.phone')}</label>
                <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="11999990000" />
              </div>
            </div>
          )}

          {step === 2 && tipo === 'profissional' && (
            <div className="space-y-3">
              <div>
                <label className="label">Tipo de registro</label>
                <select className="input" value={form.tipo_registro} onChange={(e) => setForm({ ...form, tipo_registro: e.target.value })}>
                  <option value="">Selecione</option>
                  {TIPO_REGISTRO_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="label">Número do registro</label>
                  <input className="input" value={form.registro_conselho} onChange={(e) => setForm({ ...form, registro_conselho: e.target.value.toUpperCase() })} placeholder="Ex: 123456-SP ou 06/12345" />
                </div>
                <div>
                  <label className="label">UF</label>
                  <select className="input" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
                    <option value="">-</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Formatos: CRM/COREN/CRN: NNN-NNN-UF • CREFITO: NNN-NNN/UF-N • CRP: NN/NNNNN
              </p>
            </div>
          )}

          {step === 3 && tipo === 'profissional' && (
            <div className="space-y-3">
              <div>
                <label className="label">Especialidades</label>
                <div className="flex flex-wrap gap-1.5">
                  {ESPECIALIDADES_OPCOES.map((e) => (
                    <button key={e} type="button" onClick={() => toggleList('especialidades', e)}
                      className={`px-3 py-1 rounded-full text-xs border ${
                        form.especialidades.includes(e)
                          ? 'bg-serenity-500 text-white border-serenity-500'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Disponibilidade</label>
                <div className="flex flex-wrap gap-1.5">
                  {DISPONIBILIDADE_OPCOES.map((d) => (
                    <button key={d.v} type="button" onClick={() => toggleList('disponibilidade', d.v)}
                      className={`px-3 py-1 rounded-full text-xs border ${
                        form.disponibilidade.includes(d.v)
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Bio</label>
                <textarea className="input min-h-[80px]" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Conte um pouco sobre sua experiência..." />
              </div>
            </div>
          )}

          {erro && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm mt-3">{erro}</div>}

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              className="text-slate-500 hover:text-slate-700 disabled:opacity-30">
              ← {t('common.back')}
            </button>
            {step < steps.length - 1 ? (
              <button onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && (!form.nome || !form.email || !form.senha)) ||
                  (step === 2 && tipo === 'profissional' && (!form.tipo_registro || !form.registro_conselho))
                }
                className="btn-primary">
                {t('common.next')} →
              </button>
            ) : (
              <button onClick={submit} disabled={loading} className="btn-primary">
                {loading ? t('common.loading') : t('auth.createAccount')}
              </button>
            )}
          </div>
        </Wizard>
      </div>
      <p className="text-center text-sm text-slate-500 mt-4">
        {t('auth.haveAccount')} <Link to="/login" className="text-serenity-600 hover:underline">{t('auth.loginHere')}</Link>
      </p>
    </div>
  );
}
