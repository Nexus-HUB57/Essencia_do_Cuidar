/**
 * services/profissoes.js
 *
 * Lista canônica de tipos profissionais suportados.
 *
 * É a FONTE ÚNICA da taxonomia de profissões: tanto o motor de matching
 * (services/matching.js) quanto o endpoint /api/profissoes consomem esta
 * lista. Antes existiam duas listas divergentes (`cuidador_idosos` aqui e
 * `cuidador` no matching.js), o que fazia o mesmo campo ter dois ids
 * dependendo de quem perguntava.
 *
 * O campo `profissional_desejado` (vagas) e `especialidades` (profissionais)
 * continuam sendo TEXT no schema para retrocompatibilidade. Esta lista é
 * usada para:
 *   1. Validar entrada (warn se não estiver na lista — não bloqueia)
 *   2. Sugerir opções no frontend (autocomplete)
 *   3. Normalizar para o matching automático (services/matching.js)
 *
 * Cada profissão expõe um formato superset, para atender os dois consumidores:
 *   - id        slug canônico (ex: "cuidador") — gravado no banco
 *   - label     display legado (frontend antigo)
 *   - rotulo    display novo (frontend do matching)
 *   - conselho  conselho regulador ou null (formato legado)
 *   - conselhos lista de conselhos (formato do matching)
 *   - sinonimos variações de texto livre aceitas na normalização
 */

/** @typedef {{id:string,label:string,rotulo:string,conselho:string|null,conselhos:string[],sinonimos:string[]}} Profissao */

/** @type {Profissao[]} */
export const PROFISSOES = [
  {
    id: 'cuidador',
    label: 'Cuidador de Idosos',
    rotulo: 'Cuidador de Idosos',
    conselho: null,
    conselhos: [],
    sinonimos: ['cuidador', 'cuidadora', 'acompanhante', 'cuidador de idosos', 'cuidador de idosa']
  },
  {
    id: 'enfermeiro',
    label: 'Enfermeiro(a)',
    rotulo: 'Enfermeiro',
    conselho: 'COREN',
    conselhos: ['COREN'],
    sinonimos: ['enfermeiro', 'enfermeira', 'enfermagem']
  },
  {
    id: 'tecnico_enfermagem',
    label: 'Técnico de Enfermagem',
    rotulo: 'Técnico de Enfermagem',
    conselho: 'COREN',
    conselhos: ['COREN'],
    sinonimos: ['tecnico de enfermagem', 'tecnica de enfermagem', 'tecnico_enfermagem']
  },
  {
    id: 'fisioterapeuta',
    label: 'Fisioterapeuta',
    rotulo: 'Fisioterapeuta',
    conselho: 'CREFITO',
    conselhos: ['CREFITO'],
    sinonimos: ['fisioterapeuta', 'fisio', 'fisio domiciliar', 'fisioterapia']
  },
  {
    id: 'psicologo',
    label: 'Psicólogo(a)',
    rotulo: 'Psicólogo',
    conselho: 'CRP',
    conselhos: ['CRP'],
    sinonimos: ['psicologo', 'psicologa', 'psicologia']
  },
  {
    id: 'terapeuta_ocupacional',
    label: 'Terapeuta Ocupacional',
    rotulo: 'Terapeuta Ocupacional',
    conselho: 'CREFITO',
    conselhos: ['CREFITO'],
    sinonimos: ['terapeuta ocupacional', 'to', 'terapia ocupacional']
  },
  {
    id: 'fonoaudiologo',
    label: 'Fonoaudiólogo(a)',
    rotulo: 'Fonoaudiólogo',
    conselho: 'CRP',
    conselhos: ['CRP'],
    sinonimos: ['fonoaudiologo', 'fonoaudióloga', 'fonologia']
  },
  {
    id: 'nutricionista',
    label: 'Nutricionista',
    rotulo: 'Nutricionista',
    conselho: 'CRN',
    conselhos: ['CRN'],
    sinonimos: ['nutricionista', 'nutricao', 'nutrição']
  },
  {
    id: 'medico',
    label: 'Médico(a)',
    rotulo: 'Médico',
    conselho: 'CRM',
    conselhos: ['CRM'],
    sinonimos: ['medico', 'medica', 'medicina']
  },
  {
    id: 'dentista',
    label: 'Dentista',
    rotulo: 'Dentista',
    conselho: 'CRO',
    conselhos: ['CRO'],
    sinonimos: ['dentista', 'odontologo', 'odontologia']
  }
];

/**
 * Ids legados que ainda podem aparecer em dados gravados antes da
 * unificação da taxonomia. Mapear para o id canônico evita quebrar
 * registros antigos.
 */
export const ALIAS_PROFISSAO = {
  cuidador_idosos: 'cuidador'
};

/**
 * M3 — UFs válidas (27 estados brasileiros).
 */
export const UFS_VALIDAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

/**
 * Normaliza texto livre para um dos IDs canônicos.
 * Se não encontra match exato, retorna o texto original (não bloqueia).
 *
 * @param {string} texto
 * @returns {{id: string|null, label: string, original: string, matched: boolean}}
 */
export function normalizarProfissao(texto) {
  if (!texto) return { id: null, label: '', original: '', matched: false };
  const norm = String(texto).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Alias de id legado → id canônico
  const alias = ALIAS_PROFISSAO[norm];
  if (alias) {
    const p = PROFISSOES.find((x) => x.id === alias);
    if (p) return { id: p.id, label: p.label, original: texto, matched: true };
  }

  // Procura por match exato nos sinônimos
  for (const p of PROFISSOES) {
    if (p.sinonimos.some((s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === norm)) {
      return { id: p.id, label: p.label, original: texto, matched: true };
    }
  }

  // Match parcial (contains)
  for (const p of PROFISSOES) {
    if (p.sinonimos.some((s) => {
      const ns = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return norm.includes(ns) || ns.includes(norm);
    })) {
      return { id: p.id, label: p.label, original: texto, matched: true };
    }
  }

  // Não encontrou — mantém original
  return { id: null, label: texto, original: texto, matched: false };
}

/**
 * Valida e normaliza UF.
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
 * Retorna o formato superset — serve tanto o seletor legado
 * (id/label/conselho/sinonimos) quanto o novo (id/rotulo/conselhos).
 */
export function listarProfissoes() {
  return PROFISSOES.map((p) => ({
    id: p.id,
    label: p.label,
    rotulo: p.rotulo,
    conselho: p.conselho,
    conselhos: p.conselhos,
    sinonimos: p.sinonimos
  }));
}
