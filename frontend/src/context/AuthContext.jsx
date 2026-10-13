import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('edc_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem('edc_token'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, senha) {
    const r = await api.login({ email, senha });
    localStorage.setItem('edc_token', r.token);
    setUser(r.user);
    return r.user;
  }

  async function register(data) {
    const r = await api.register(data);
    localStorage.setItem('edc_token', r.token);
    setUser(r.user);
    return r.user;
  }

  function logout() {
    localStorage.removeItem('edc_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
