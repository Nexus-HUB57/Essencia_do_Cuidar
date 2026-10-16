import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTema } from '../hooks/useTema';
import BotaoInstalar from './BotaoInstalar';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTema();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" className="w-8 h-8" alt="Essência do Cuidar" />
          <span className="font-bold text-lg text-slate-900 dark:text-white">Essência do Cuidar</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink to="/" end className={({ isActive }) =>
            isActive ? 'text-serenity-600 dark:text-serenity-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:text-serenity-600 dark:hover:text-serenity-300'}>
            Início
          </NavLink>
          <NavLink to="/vagas" className={({ isActive }) =>
            isActive ? 'text-serenity-600 dark:text-serenity-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:text-serenity-600 dark:hover:text-serenity-300'}>
            Vagas
          </NavLink>
          <NavLink to="/como-funciona" className={({ isActive }) =>
            isActive ? 'text-serenity-600 dark:text-serenity-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:text-serenity-600 dark:hover:text-serenity-300'}>
            Como funciona
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <BotaoInstalar />
          <button
            onClick={toggle}
            className="text-sm px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Alternar tema"
            title={isDark ? 'Tema claro' : 'Tema escuro'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          {user ? (
            <>
              <Link
                to={user.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante'}
                className="btn-ghost text-xs sm:text-sm"
              >
                {user.nome.split(' ')[0]}
              </Link>
              <button onClick={handleLogout} className="text-sm text-slate-500 dark:text-slate-400 hover:text-rose-500 px-2">
                Sair
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-xs sm:text-sm">Entrar</Link>
              <Link to="/cadastro" className="btn-primary text-xs sm:text-sm">Cadastrar</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
