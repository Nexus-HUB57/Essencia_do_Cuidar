import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUnreadCount } from '../hooks/useUnreadCount';

export default function Navbar() {
  const { user, logout } = useAuth();
  const unread = useUnreadCount();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" className="w-8 h-8" alt="Essência do Cuidar" />
          <span className="font-bold text-lg text-slate-900">Essência do Cuidar</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink to="/" end className={({ isActive }) =>
            isActive ? 'text-serenity-600 font-medium' : 'text-slate-600 hover:text-serenity-600'}>
            Início
          </NavLink>
          <NavLink to="/vagas" className={({ isActive }) =>
            isActive ? 'text-serenity-600 font-medium' : 'text-slate-600 hover:text-serenity-600'}>
            Vagas
          </NavLink>
          <NavLink to="/como-funciona" className={({ isActive }) =>
            isActive ? 'text-serenity-600 font-medium' : 'text-slate-600 hover:text-serenity-600'}>
            Como funciona
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to={user.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante'}
                className="btn-ghost text-xs sm:text-sm relative"
              >
                {user.nome.split(' ')[0]}
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-rose-500 px-2">
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
