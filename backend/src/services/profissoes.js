/**
 * services/profissoes.js
 *
 * M2 — Lista canônica de tipos profissionais suportados.
 *
 * O campo `profissional_desejado` (vagas) e `especialidades` (profissionais)
 * continuam sendo TEXT no schema para retrocompatibilidade. Mas esta lista
 * é usada para:
 *   1. Validar entrada (warn se não estiver na lista — não bloqueia)
 *   2. Sugerir opções no frontend (autocomplete)
 *   3. Normalizar para o matching automático (services/matching.js)
 *
 * Cada profissão tem:
 *   - id (slug canônico, ex: "cuidador_idosos")
 *   - label (display)
 *   - conselho (qual conselho regulamenta, se houver)
 *   - sinônimos (variações aceitas pelo matching)
 */

export const PROFISSOES = [
  {
    id: 'cuidador_idosos',
    label: 'Cuidador de Idosos',
    conselho: null,
    sinonimos: ['cuidador', 'cuidadora', 'acompanhante', 'cuidador de idosos', 'cuidador de idosa']
  },
  {
    id: 'enfermeiro',
    label: 'Enfermeiro(a)',
    conselho: 'COREN',
    sinonimos: ['enfermeiro', 'enfermeira', 'enfermagem']
  },
  {
    id: 'tecnico_enfermagem',
    label: 'Técnico de Enfermagem',
    conselho: 'COREN',
    sinonimos: ['tecnico de enfermagem', 'tecnica de enfermagem', 'tecnico_enfermagem']
  },
  {
    id: 'fisioterapeuta',
    label: 'Fisioterapeuta',
    conselho: 'CREFITO',
    sinonimos: ['fisioterapeuta', 'fisio', 'fisio domiciliar', 'fisioterapia']
  },
  {
    id: 'psicologo',
    label: 'Psicólogo(a)',
    conselho: 'CRP',
    sinonimos: ['psicologo', 'psicologa', 'psicologia']
  },
  {
    id: 'terapeuta_ocupacional',
    label: 'Terapeuta Ocupacional',
    conselho: 'CREFITO',
    sinonimos: ['terapeuta ocupacional', 'to', 'terapia ocupacional']
  },
  {
    id: 'nutricionista',
    label: 'Nutricionista',
    conselho: 'CRN',
    sinonimos: ['nutricionista', 'nutricao']
  },
  {
    id: 'medico',
    label: 'Médico(a)',
    conselho: 'CRM',
    sinonimos: ['medico', 'medica', 'medicina']
  }
];

/**
 * M3 — UFs válidas (27 estados brasileiros).
 */
export const UFS_VALIDAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

/**
 * M2 — Normaliza texto livre para um dos IDs canônicos.
 * Se não encontra match exato, retorna o texto original (não bloqueia).
 *
 * @param {string} texto
 * @returns {Object} { id: string|null, label: string, original: string, matched: boolean }
 */
export function normalizarProfissao(texto) {
  if (!texto) return { id: null, label: '', original: '', matched: false };
  const norm = String(texto).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Procura por match exato nos sinônimos
  for (const p of PROFISSOES) {
    if (p.sinonimos.some(s => s.toLowerCase() === norm)) {
      return { id: p.id, label: p.label, original: texto, matched: true };
    }
  }

  // Match parcial (contains)
  for (const p of PROFISSOES) {
    if (p.sinonimos.some(s => norm.includes(s.toLowerCase()) || s.toLowerCase().includes(norm))) {
      return { id: p.id, label: p.label, original: texto, matched: true };
    }
  }

  // Não encontrou — mantém original
  return { id: null, label: texto, original: texto, matched: false };
}

/**
 * M3 — Valida e normaliza UF.
 * @param {string} uf
 * @returns {string|null} UF canônica (uppercase) ou null se inválida
 */
export function validarUF(uf) {
  if (!uf) return null;
  const norm = String(uf).toUpperCase().trim();
  return UFS_VALIDAS.includes(norm) ? norm : null;
}

/**
 * Lista de profissões para o frontend (autocomplete).
 */
export function listarProfissoes() {
  return PROFISSOES.map(p => ({
    id: p.id,
    label: p.label,
    conselho: p.conselho,
    sinonimos: p.sinonimos
  }));
}
