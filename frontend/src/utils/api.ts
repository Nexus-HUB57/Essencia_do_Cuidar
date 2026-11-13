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
  const data = ax?.response?.data;

  // `details` vem PRIMEIRO. A resposta de validação é
  // { error: 'Validação falhou', details: [{field, msg}] } — checando
  // `error` antes, o motivo (qual campo falhou, e por quê) nunca chegava
  // ao usuário: ele só via "Validação falhou", sem indicação de nada.
  const detalhes = data?.details;
  if (Array.isArray(detalhes) && detalhes.length > 0) {
    const lista = (detalhes as Array<{ field: string; msg: string }>)
      .map((x) => `${x.field}: ${x.msg}`)
      .join('; ');
    return data?.error ? `${data.error} — ${lista}` : lista;
  }
  if (data?.error) return data.error;
  if (ax?.message) return ax.message;
  return 'Erro inesperado';
}

export default api;
