import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="container-page py-16 text-center text-brand-slate">Carregando…</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (role && user.tipo_usuario !== role) {
    return <Navigate to="/" replace />;
  }
  return children;
}
