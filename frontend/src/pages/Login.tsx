import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth, useErrorTranslator } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const { t } = useTranslation();
  const translateError = useErrorTranslator();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const u = await login(email, senha);
      toast.success('Bem-vindo de volta!', `Olá, ${u.nome.split(' ')[0]}`);
      navigate(u.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante');
    } catch (err) {
      setErro(translateError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12 fade-in">
      <div className="card">
        <h1 className="text-2xl font-bold text-center mb-1">{t('login.title')}</h1>
        <p className="text-center text-slate-500 text-sm mb-6">
          {t('login.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('login.email')}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t('login.password')}</label>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {erro && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-xl">{erro}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          {t('login.noAccount')}{' '}
          <Link to="/cadastro" className="text-serenity-600 font-medium hover:underline">
            {t('login.signupLink')}
          </Link>
        </p>

        <div className="mt-6 p-3 bg-serenity-50 rounded-xl text-xs text-serenity-800">
          <p className="font-semibold mb-1">
            <Trans
              i18nKey="login.demoTitle"
              values={{ password: 'demo1234' }}
              components={{ code: <code /> }}
            />
          </p>
          <ul className="space-y-0.5">
            {(t('login.demos', { returnObjects: true }) as Array<{ email: string; label: string }>).map((d) => (
              <li key={d.email}>• <code>{d.email}</code> ({d.label})</li>
            ))}
          </ul>
        </div>
        <div>
          <label className="label">{t('auth.password')}</label>
          <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {erro && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">{erro}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t('common.loading') : t('auth.login')}
        </button>
        <p className="text-xs text-center text-slate-500">
          Demo: <code>maria@demo.com</code> / <code>demo1234</code> • admin: <code>admin@demo.com</code> / <code>admin1234</code>
        </p>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        {t('auth.noAccount')} <Link to="/cadastro" className="text-serenity-600 hover:underline">{t('auth.registerHere')}</Link>
      </p>
    </div>
  );
}
