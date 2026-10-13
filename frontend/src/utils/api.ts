import axios, { AxiosError } from 'axios';

// Em produção, a URL da API pode ser sobrescrita por window.__API_URL__
// (definida em runtime) ou por VITE_API_URL (build-time).
const API_BASE: string =
  (typeof window !== 'undefined' && (window as any).__API_URL__) ||
  (import.meta as any).env?.VITE_API_URL ||
  '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('essencia_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<any>) => {
    if (err.response?.status === 401) {
      // Token inválido/expirado: limpa sessão
      localStorage.removeItem('essencia_token');
      localStorage.removeItem('essencia_user');
      if (location.pathname !== '/login' && location.pathname !== '/cadastro') {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function getErrorMessage(err: unknown): string {
  const ax = err as AxiosError<any>;
  if (ax?.response?.data?.error) return ax.response.data.error;
  if (ax?.response?.data?.details) {
    const d = ax.response.data.details as Array<{ field: string; msg: string }>;
    return d.map((x) => `${x.field}: ${x.msg}`).join('; ');
  }
  if (ax?.message) return ax.message;
  return 'Erro inesperado';
}

export default api;
