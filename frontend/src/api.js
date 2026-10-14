const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('edc_token');
}

/** Request com JSON (default). Não seta Content-Type manualmente quando usa FormData. */
async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body != null) {
    headers['content-type'] = 'application/json';
  }
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

/**
 * Monta FormData com os campos textuais e arquivos.
 * Importante: cada campo de texto vira um append() simples — o browser usa text/plain
 * por padrão, evitando o bug do curl com auto-detect de application/json em multer 2.x.
 */
function buildRegisterForm({ tipo_usuario, nome, email, senha, telefone,
                              registro_conselho, especialidades, disponibilidade,
                              diploma, registro_conselho_doc }) {
  const fd = new FormData();
  fd.append('tipo_usuario', String(tipo_usuario || ''));
  fd.append('nome', String(nome || ''));
  fd.append('email', String(email || ''));
  fd.append('senha', String(senha || ''));
  if (telefone) fd.append('telefone', String(telefone));
  if (tipo_usuario === 'profissional') {
    if (registro_conselho) fd.append('registro_conselho', String(registro_conselho));
    fd.append('especialidades', JSON.stringify(especialidades || []));
    fd.append('disponibilidade', JSON.stringify(disponibilidade || {}));
    if (diploma instanceof File) fd.append('diploma', diploma);
    if (registro_conselho_doc instanceof File) fd.append('registro_conselho_doc', registro_conselho_doc);
  }
  return fd;
}

/** Upload avulso de documento (PUT /api/profissionais/me/documentos) */
function buildDocumentoForm(tipo, arquivo) {
  const fd = new FormData();
  fd.append('tipo', tipo); // 'diploma' | 'registro_conselho'
  fd.append('arquivo', arquivo);
  return fd;
}

export const api = {
  // auth
  register: (data) => {
    if (data.diploma || data.registro_conselho_doc) {
      const fd = buildRegisterForm(data);
      return request('/auth/register', { method: 'POST', body: fd });
    }
    return request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
  },
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

  // profissionais
  getMeuPerfil: () => request('/profissionais/me'),
  atualizarMeuPerfil: (data) => request('/profissionais/me', { method: 'PUT', body: JSON.stringify(data) }),
  uploadDocumento: (tipo, arquivo) =>
    request('/profissionais/me/documentos', { method: 'PUT', body: buildDocumentoForm(tipo, arquivo) }),
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

  // avaliações
  avaliacoesPendentes: () => request('/avaliacoes/pendentes'),
  avaliacoesDaVaga: (idVaga) => request(`/avaliacoes?vaga=${idVaga}`),
  reviewsProfissional: (id) => request(`/avaliacoes/profissional/${id}`),
  criarAvaliacao: (data) => request('/avaliacoes', { method: 'POST', body: JSON.stringify(data) }),
};
