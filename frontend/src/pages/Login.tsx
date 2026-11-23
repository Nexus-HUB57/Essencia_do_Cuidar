import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
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
      navigate(u.tipo_usuario === 'profissional' ? '/dashboard/profissional'
             : u.tipo_usuario === 'contratante' ? '/dashboard/contratante'
             : '/admin');
    } catch (e) {
      setErro(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12 fade-in">
      <h1 className="text-2xl font-bold text-center mb-6">{t('auth.login')}</h1>
      <form onSubmit={submit} className="card space-y-3">
        <div>
          <label className="label">{t('auth.email')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
