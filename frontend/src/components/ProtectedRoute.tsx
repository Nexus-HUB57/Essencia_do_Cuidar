import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  tipo?: 'profissional' | 'contratante';
}

export default function ProtectedRoute({ children, tipo }: Props) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-pulse text-slate-400">{t('protectedRoute.loading')}</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (tipo && user.tipo_usuario !== tipo) {
    const destino = user.tipo_usuario === 'profissional'
      ? '/dashboard/profissional'
      : '/dashboard/contratante';
    return <Navigate to={destino} replace />;
  }
  return <>{children}</>;
}
