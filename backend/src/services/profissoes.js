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
  },
  {
    id: 'fonoaudiologo',
    label: 'Fonoaudiólogo(a)',
    conselho: 'CRP',
    sinonimos: ['fonoaudiologo', 'fonoaudiologa', 'fonologia', 'fonoaudiólogo']
  },
  {
    id: 'dentista',
    label: 'Dentista',
    conselho: 'CRO',
    sinonimos: ['dentista', 'odontologo', 'odontologia']
  }
];

/**
 * Profissões que substituem parcialmente umas às outras.
 *
 * O valor é o quanto o match "parcial" vale contra o peso do critério de
 * profissão no motor de matching. Consultado simetricamente.
 *
 * Ex.: um técnico de enfermagem atende bem uma vaga de cuidador (0.7),
 * mas não uma vaga de fisioterapeuta (sem entrada = 0).
 */
export const COMPATIBILIDADE = {
  tecnico_enfermagem:    { enfermeiro: 0.6, cuidador_idosos: 0.7, medico: 0.3 },
  enfermeiro:            { tecnico_enfermagem: 0.6, medico: 0.5, cuidador_idosos: 0.4 },
  cuidador_idosos:       { tecnico_enfermagem: 0.7, enfermeiro: 0.4, fisioterapeuta: 0.3, psicologo: 0.3 },
  fisioterapeuta:        { terapeuta_ocupacional: 0.7, enfermeiro: 0.3 },
  terapeuta_ocupacional: { fisioterapeuta: 0.7, psicologo: 0.5 },
  psicologo:             { terapeuta_ocupacional: 0.5, fonoaudiologo: 0.4 },
  medico:                { enfermeiro: 0.5, tecnico_enfermagem: 0.3, nutricionista: 0.3 },
  nutricionista:         { medico: 0.3, enfermeiro: 0.2 },
  fonoaudiologo:         { psicologo: 0.4 }
};

/**
 * Compatibilidade entre duas profissões (0 = incompatíveis, 1 = mesma).
 * @param {string} idA
 * @param {string} idB
 * @returns {number} 0.0 a 1.0
 */
export function compatibilidadeEntre(idA, idB) {
  if (!idA || !idB) return 0;
  if (idA === idB) return 1;
  return COMPATIBILIDADE[idA]?.[idB] ?? COMPATIBILIDADE[idB]?.[idA] ?? 0;
}

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

  // Match parcial (contains) — o sinônimo MAIS LONGO primeiro.
  // Sem ordenar, "Técnico de Enfermagem" era classificado como "enfermeiro"
  // (porque 'enfermagem' é substring de 'técnico de enfermagem' e o
  // enfermeiro vem antes na lista).
  const candidatos = [];
  for (const p of PROFISSOES) {
    for (const sin of p.sinonimos) {
      const sl = sin.toLowerCase();
      if (norm.includes(sl) || sl.includes(norm)) {
        candidatos.push({ len: sl.length, p });
      }
    }
  }
  if (candidatos.length > 0) {
    candidatos.sort((a, b) => b.len - a.len);
    const p = candidatos[0].p;
    return { id: p.id, label: p.label, original: texto, matched: true };
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
