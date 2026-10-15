import { Link, useNavigate } from 'react-router-dom';
import { useAuth, getErrorMessage } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import PushPrompt from './PushPrompt';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-serenity-500 to-emerald-500 text-white flex items-center justify-center font-bold text-sm">EC</div>
          <span className="font-bold text-slate-800 hidden sm:inline">{t('common.appName')}</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-3 text-sm">
          <Link to="/vagas" className="text-slate-600 hover:text-serenity-600 px-2 sm:px-3 py-1.5">{t('nav.vagas')}</Link>
          <Link to="/como-funciona" className="text-slate-600 hover:text-serenity-600 px-2 sm:px-3 py-1.5 hidden sm:inline">{t('nav.howItWorks')}</Link>

          {user ? (
            <>
              <Link
                to={user.tipo_usuario === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante'}
                className="text-slate-600 hover:text-serenity-600 px-2 sm:px-3 py-1.5"
              >
                {t('nav.dashboard')}
              </Link>
              {user.is_admin && (
                <Link to="/admin" className="text-amber-600 hover:underline px-2 sm:px-3 py-1.5 text-xs font-semibold">
                  🛡️ {t('nav.admin')}
                </Link>
              )}
              <div className="hidden sm:flex items-center gap-1">
                <LanguageSwitcher />
                <PushPrompt />
              </div>
              <button onClick={handleLogout} className="text-slate-500 hover:text-rose-500 text-xs sm:text-sm">
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <div className="hidden sm:flex items-center gap-1">
                <LanguageSwitcher />
              </div>
              <Link to="/login" className="text-slate-600 hover:text-serenity-600 px-2 sm:px-3 py-1.5">{t('nav.login')}</Link>
              <Link to="/cadastro" className="btn-primary text-xs px-3 py-1.5">{t('nav.register')}</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
