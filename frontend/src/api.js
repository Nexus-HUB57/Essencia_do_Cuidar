const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('edc_token');
}

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

  // profissionais
  getMeuPerfil: () => request('/profissionais/me'),
  atualizarMeuPerfil: (data) => request('/profissionais/me', { method: 'PUT', body: JSON.stringify(data) }),
  getProfissional: (id) => request(`/profissionais/${id}`),

  // vagas
  listarVagas: (filtros = {}) => {
    const qs = new URLSearchParams(filtros).toString();
    return request(`/vagas${qs ? `?${qs}` : ''}`);
  },
  getVaga: (id) => request(`/vagas/${id}`),
  criarVaga: (data) => request('/vagas', { method: 'POST', body: JSON.stringify(data) }),
  minhasVagas: () => request('/vagas/minhas/list'),
  mudarStatusVaga: (id, status) => request(`/vagas/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // candidaturas
  candidatar: (data) => request('/candidaturas', { method: 'POST', body: JSON.stringify(data) }),
  minhasCandidaturas: () => request('/candidaturas/minhas'),
  candidatosDaVaga: (idVaga) => request(`/candidaturas?vaga=${idVaga}`),
  atualizarCandidatura: (id, status_candidatura) =>
    request(`/candidaturas/${id}`, { method: 'PATCH', body: JSON.stringify({ status_candidatura }) }),

  // chat
  getMensagens: (idVaga) => request(`/chat?vaga=${idVaga}`),
  enviarMensagem: (idVaga, corpo) => request('/chat', { method: 'POST', body: JSON.stringify({ id_vaga: idVaga, corpo }) }),
};
