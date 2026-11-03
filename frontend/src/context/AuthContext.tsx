import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api, { getErrorMessage } from '../utils/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<User>;
  cadastro: (data: any) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('essencia_user');
    if (stored && localStorage.getItem('essencia_token')) {
      try { setUser(JSON.parse(stored)); }
      catch { localStorage.removeItem('essencia_user'); }
    }
    setLoading(false);
  }, []);

  async function login(email: string, senha: string) {
    const { data } = await api.post('/auth/login', { email, senha });
    localStorage.setItem('essencia_token', data.token);
    localStorage.setItem('essencia_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function cadastro(payload: any) {
    const { data } = await api.post('/auth/cadastro', payload);
    localStorage.setItem('essencia_token', data.token);
    localStorage.setItem('essencia_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('essencia_token');
    localStorage.removeItem('essencia_user');
    setUser(null);
  }

  async function refreshUser() {
    try {
      const { data } = await api.get('/auth/me');
      const u = data.user;
      localStorage.setItem('essencia_user', JSON.stringify(u));
      setUser(u);
    } catch (err) {
      // silencioso
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, cadastro, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}

export { getErrorMessage };
