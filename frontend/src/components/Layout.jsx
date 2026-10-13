import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-brand-blue grid place-items-center">
              <div className="h-5 w-5 rounded-full bg-brand-green" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Essência do Cuidar</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'text-brand-blue' : 'text-brand-slate hover:text-brand-ink'}`}>Início</NavLink>
            <NavLink to="/como-funciona" className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'text-brand-blue' : 'text-brand-slate hover:text-brand-ink'}`}>Como Funciona</NavLink>
            {user && (
              <NavLink to={user.tipo_usuario === 'profissional' ? '/dashboard-profissional' : '/dashboard-contratante'} className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'text-brand-blue' : 'text-brand-slate hover:text-brand-ink'}`}>
                Dashboard
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:inline text-sm text-brand-slate">Olá, <b className="text-brand-ink">{user.nome.split(' ')[0]}</b></span>
                <button onClick={handleLogout} className="btn-ghost text-sm">Sair</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost text-sm">Entrar</Link>
                <Link to="/cadastro" className="btn-primary text-sm">Cadastrar</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-100 bg-brand-mist">
        <div className="container-page py-8 text-sm text-brand-slate flex flex-col sm:flex-row sm:justify-between gap-2">
          <p>© {new Date().getFullYear()} Essência do Cuidar — cuidado com confiança.</p>
          <p>Atendimento domiciliar de baixa e média complexidade.</p>
        </div>
      </footer>
    </div>
  );
}
