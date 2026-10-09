import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const from = (location.state as any)?.from?.pathname;
      navigate(from || (user.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante'), { replace: true });
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const u = await login(email, senha);
      navigate(u.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante');
    } catch (err) {
      setErro(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12 fade-in">
      <div className="card">
        <h1 className="text-2xl font-bold text-center mb-1">Entrar</h1>
        <p className="text-center text-slate-500 text-sm mb-6">
          Acesse seu painel da Essência do Cuidar
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {erro && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-xl">{erro}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Não tem conta?{' '}
          <Link to="/cadastro" className="text-serenity-600 font-medium hover:underline">
            Cadastre-se
          </Link>
        </p>

        <div className="mt-6 p-3 bg-serenity-50 rounded-xl text-xs text-serenity-800">
          <p className="font-semibold mb-1">Contas demo (senha: <code>demo1234</code>)</p>
          <ul className="space-y-0.5">
            <li>• <code>maria@demo.com</code> (contratante +Saúde)</li>
            <li>• <code>ana@demo.com</code> (profissional)</li>
            <li>• <code>joao@demo.com</code> (profissional)</li>
            <li>• <code>bia@demo.com</code> (profissional)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
