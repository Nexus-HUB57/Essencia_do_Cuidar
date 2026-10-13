import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErro(''); setLoading(true);
    try {
      const user = await login(email, senha);
      const dest = from || (user.tipo_usuario === 'profissional' ? '/dashboard-profissional' : '/dashboard-contratante');
      navigate(dest, { replace: true });
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="container-page py-12 sm:py-16">
      <div className="max-w-md mx-auto card">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="text-sm text-brand-slate mt-1">Acesse sua conta para gerenciar vagas ou candidaturas.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="senha">Senha</label>
            <input id="senha" type="password" className="input" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} autoComplete="current-password" />
          </div>
          {erro && <p className="text-sm text-rose-600">{erro}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-sm text-brand-slate text-center">
          Ainda não tem conta? <Link to="/cadastro" className="text-brand-blue font-medium">Cadastre-se</Link>
        </p>
        <p className="mt-2 text-xs text-brand-slate text-center">
          Demo: <b>maria@demo.com</b> (contratante) ou <b>joao@demo.com</b> (profissional) — senha <b>senha123</b>
        </p>
      </div>
    </section>
  );
}
