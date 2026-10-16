import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useUnreadCount } from '../hooks/useUnreadCount';
import LanguageSwitcher from './LanguageSwitcher';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const unread = useUnreadCount();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" className="w-8 h-8" alt={t('navbar.logoAlt')} />
          <span className="font-bold text-lg text-slate-900">{t('app.name')}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink to="/" end className={({ isActive }) =>
            isActive ? 'text-serenity-600 font-medium' : 'text-slate-600 hover:text-serenity-600'}>
            {t('navbar.home')}
          </NavLink>
          <NavLink to="/vagas" className={({ isActive }) =>
            isActive ? 'text-serenity-600 font-medium' : 'text-slate-600 hover:text-serenity-600'}>
            {t('navbar.jobs')}
          </NavLink>
          <NavLink to="/como-funciona" className={({ isActive }) =>
            isActive ? 'text-serenity-600 font-medium' : 'text-slate-600 hover:text-serenity-600'}>
            {t('navbar.howItWorks')}
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              {user.tipo_usuario === 'admin' && (
                <NavLink to="/admin" className={({ isActive }) =>
                  isActive
                    ? 'text-amber-600 font-semibold text-xs sm:text-sm'
                    : 'text-amber-700 hover:text-amber-600 text-xs sm:text-sm font-medium'}>
                  {t('admin.title')}
                </NavLink>
              )}
              <Link
                to={
                  user.tipo_usuario === 'profissional' ? '/dashboard/profissional'
                  : user.tipo_usuario === 'contratante' ? '/dashboard/contratante'
                  : '/admin'
                }
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
                {t('navbar.logout')}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-xs sm:text-sm">{t('navbar.login')}</Link>
              <Link to="/cadastro" className="btn-primary text-xs sm:text-sm">{t('navbar.signup')}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
