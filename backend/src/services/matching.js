/**
 * services/matching.js
 *
 * Sistema de matching automático entre profissionais e vagas.
 *
 * ── Por que este arquivo foi reescrito (Sprint 2 / M1-fix) ──────────────
 *
 * A versão anterior (Sprint 1) comparava o campo `profissional_desejado` da
 * vaga com as `especialidades` do profissional usando Jaccard de tokens. Isso
 * **nunca pontuava**: `especialidades` guarda foco clínico (Alzheimer,
 * Geriatria, Pós-operatório), não a profissão, e o stemming não existia
 * ("fisioterapia" ≠ "fisioterapeuta"). Resultado: o critério de maior peso
 * (0.40) era permanentemente 0 e o score máximo real era ~0.60.
 *
 * Agora o modelo é:
 *   1. O profissional declara sua `profissao` (taxonomia canônica) e sua
 *      `regiao` de atuação — campos que antes simplesmente não existiam.
 *   2. A profissão da vaga (texto livre) é canonicalizada pela mesma
 *      taxonomia, com sinônimos e stemming por prefixo.
 *   3. Critérios sem dados são **redistribuídos** proporcionalmente, de modo
 *      que o score final continue numa escala 0.0–1.0 interpretável.
 *   4. Os motivos saem estruturados (`codigo` + `detalhe`) para que o
 *      frontend consiga traduzi-los (pt-BR / es / en).
 *
 * Endpoints que usam este serviço:
 *   GET /api/vagas/:id/recomendar          → top N profissionais para uma vaga
 *   GET /api/profissionais/me/recomendar   → top N vagas para o profissional logado
 *   GET /api/profissionais/profissoes       → taxonomia canônica (para o formulário)
 *
 * Não há mudança de contrato — matching automático é opcional e aditivo.
 * O fluxo manual (filtrar + candidatar) continua funcionando.
 */
import db from '../db/driver.js';

/* ═══════════════════════════ Taxonomia de profissões ═══════════════════════ */

/**
 * Lista canônica de profissões. O `id` é o valor gravado em
 * `profissionais_detalhes.profissao` e devolvido pela API.
 * `rotulo` é a exibição em pt-BR (o frontend traduz via i18n).
 */
export const PROFISSOES = [
  { id: 'cuidador',              rotulo: 'Cuidador de Idosos',     conselhos: [] },
  { id: 'tecnico_enfermagem',    rotulo: 'Técnico de Enfermagem',  conselhos: ['COREN'] },
  { id: 'enfermeiro',            rotulo: 'Enfermeiro',              conselhos: ['COREN'] },
  { id: 'fisioterapeuta',        rotulo: 'Fisioterapeuta',          conselhos: ['CREFITO'] },
  { id: 'terapeuta_ocupacional', rotulo: 'Terapeuta Ocupacional',   conselhos: ['CREFITO'] },
  { id: 'psicologo',             rotulo: 'Psicólogo',               conselhos: ['CRP'] },
  { id: 'fonoaudiologo',         rotulo: 'Fonoaudiólogo',           conselhos: ['CRP'] },
  { id: 'nutricionista',         rotulo: 'Nutricionista',           conselhos: ['CRN'] },
  { id: 'medico',                rotulo: 'Médico',                  conselhos: ['CRM'] },
  { id: 'dentista',               rotulo: 'Dentista',                conselhos: ['CRO'] }
];

const PROFISSAO_IDS = new Set(PROFISSOES.map((p) => p.id));

/**
 * Stems (radicais) que identificam uma profissão em texto livre.
 * A busca usa o radical mais longo primeiro, para que
 * "técnico de enfermagem" não seja classificado como "enfermeiro".
 */
const STEMS = [
  ['tecnico de nursing',        'tecnico_enfermagem'],
  ['tecnico de enfermagem',     'tecnico_enfermagem'],
  ['tecnica de enfermagem',     'tecnico_enfermagem'],
  ['auxiliar de enfermagem',    'tecnico_enfermagem'],
  ['tecnico de enfermag',       'tecnico_enfermagem'],
  ['cuidador de idosos',        'cuidador'],
  ['cuidador de idosa',         'cuidador'],
  ['cuidador de pessoa',        'cuidador'],
  ['acompanhante familiar',     'cuidador'],
  ['acompanhante',              'cuidador'],
  ['cuidador',                  'cuidador'],
  ['cuidadora',                 'cuidador'],
  ['enfermeiro',                'enfermeiro'],
  ['enfermeira',                'enfermeiro'],
  ['enfermagem',                'enfermeiro'],
  ['fisioterapeuta',            'fisioterapeuta'],
  ['fisioterapia',               'fisioterapeuta'],
  ['fisioterapia domiciliar',    'fisioterapeuta'],
  ['fisio',                     'fisioterapeuta'],
  ['terapeuta ocupacional',     'terapeuta_ocupacional'],
  ['ocupacional',               'terapeuta_ocupacional'],
  ['psicologo',                 'psicologo'],
  ['psicologa',                 'psicologo'],
  ['psicologia',                'psicologo'],
  ['psicoterapia',               'psicologo'],
  ['fonoaudiologo',             'fonoaudiologo'],
  ['fonologia',                 'fonoaudiologo'],
  ['nutricionista',              'nutricionista'],
  ['nutricao',                  'nutricionista'],
  ['medico',                    'medico'],
  ['medica',                    'medico'],
  ['medicina',                  'medico'],
  ['clinica medica',            'medico'],
  ['dentista',                  'dentista'],
  ['odontologo',                'dentista']
].sort((a, b) => b[0].length - a[0].length);

/**
 * Profissões que substituem parcialmente umas às outras.
 * O valor é o quanto o match "parcial" vale (0..1) contra o peso do critério.
 * Consultado simetricamente.
 */
const COMPATIBILIDADE = {
  'tecnico_enfermagem':    { 'enfermeiro': 0.6, 'cuidador': 0.7, 'medico': 0.3 },
  'enfermeiro':            { 'tecnico_enfermagem': 0.6, 'medico': 0.5, 'cuidador': 0.4 },
  'cuidador':              { 'tecnico_enfermagem': 0.7, 'enfermeiro': 0.4, 'fisioterapeuta': 0.3, 'psicologo': 0.3 },
  'fisioterapeuta':        { 'terapeuta_ocupacional': 0.7, 'enfermeiro': 0.3 },
  'terapeuta_ocupacional': { 'fisioterapeuta': 0.7, 'psicologo': 0.5 },
  'psicologo':             { 'terapeuta_ocupacional': 0.5, 'fonoaudiologo': 0.4 },
  'medico':                { 'enfermeiro': 0.5, 'tecnico_enfermagem': 0.3, 'nutricionista': 0.3 },
  'nutricionista':         { 'medico': 0.3, 'enfermeiro': 0.2 },
  'fonoaudiologo':         { 'psicologo': 0.4 }
};

/** Consejo (tipo_registro) → profissão. Usado só como fallback. */
const CONSELHO_PROFISSAO = {
  COREN:   'enfermeiro',
  CREFITO: 'fisioterapeuta',
  CRP:     'psicologo',
  CRN:     'nutricionista',
  CRM:     'medico',
  CRO:     'dentista'
};

/* ═════════════════════════════ Pesos dos critérios ════════════════════════ */

export const PESOS = {
  profissao:      0.40,  // profissão canônica confere
  disponibilidade: 0.20, // sobreposição de turnos
  reputacao:      0.15,  // média de avaliações
  especialidade:  0.10,  // afinidade entre especialidades e o texto da vaga
  registro:       0.05,  // selo de registro verificado
  regiao:         0.10   // proximidade geográfica
};

/* ═══════════════════════════════ Utilidades ════════════════════════════════ */

const UFS_VALIDAS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]);

/**
 * Normaliza um texto: lowercase, sem acentos, espaços colapsados.
 * @param {string} texto
 * @returns {string}
 */
export function normalizarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')  // mantém letras, números, espaço e hífen
    .replace(/\s+/g, ' ')
    .trim();
}
/**
 * Canonicaliza um texto livre para um id de profissão.
 * @param {string} texto
 * @returns {string|null} id da profissão ou null se não reconhecível
 */
export function resolverProfissao(texto) {
  const norm = normalizarTexto(texto);
  if (!norm) return null;
  for (const [stem, id] of STEMS) {
    if (norm === stem || norm.includes(stem)) return id;
  }
  return null;
}

/**
 * Infere a profissão de um profissional quando `profissao` não foi informada:
 * 1) conselho (tipo_registro) → 2) especialidades.
 * @param {Object} detalhes
 * @returns {string|null}
 */
export function inferirProfissao(detalhes) {
  if (!detalhes) return null;

  const declarada = normalizarTexto(detalhes.profissao || '').replace(/\s+/g, '_');
  if (PROFISSAO_IDS.has(declarada)) return declarada;
  if (detalhes.profissao && PROFISSAO_IDS.has(detalhes.profissao)) return detalhes.profissao;

  const conselho = String(detalhes.tipo_registro || '').toUpperCase();
  if (CONSELHO_PROFISSAO[conselho]) return CONSELHO_PROFISSAO[conselho];

  const especialidades = parseJsonArray(detalhes.especialidades);
  for (const esp of especialidades) {
    const id = resolverProfissao(esp);
    if (id) return id;
  }
  return null;
}

/**
 * Parse defensivo de campo JSON (string ou array).
 * @param {*} valor
 * @returns {string[]}
 */
function parseJsonArray(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor.filter(Boolean).map(String);
  try {
    const arr = JSON.parse(valor);
    return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Coeficiente de Jaccard entre dois conjuntos de tokens.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0.0 a 1.0
 */
export function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const uni = setA.size + setB.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

/**
 * Detecta turnos a partir de string de horário.
 * "08h às 18h" → ['manha', 'tarde']
 * "20h às 08h" → ['noite', 'manha']
 * @param {string} horario
 * @returns {string[]}
 */
export function extrairTurnos(horario) {
  if (!horario) return [];
  const norm = normalizarTexto(horario);
  const turnos = new Set();
  const horas = norm.match(/\d{1,2}\s*h/g)?.map((h) => parseInt(h, 10)) || [];
  if (horas.length >= 2) {
    const [inicio, fim] = horas;
    const end = fim < inicio ? fim + 24 : fim;
    let h = inicio;
    while (h < end) {
      const hh = h % 24;
      if (hh >= 6 && hh < 12) turnos.add('manha');
      else if (hh >= 12 && hh < 18) turnos.add('tarde');
      else if (hh >= 18 && hh < 24) turnos.add('noite');
      else turnos.add('madrugada');
      h++;
    }
  }
  if (/\bmanha\b/.test(norm)) turnos.add('manha');
  if (/\btarde\b/.test(norm)) turnos.add('tarde');
  if (/\bnoite\b/.test(norm)) turnos.add('noite');
  if (/\bmadrugada\b/.test(norm)) turnos.add('madrugada');
  return Array.from(turnos);
}

/**
 * Mapeia disponibilidade para turnos canônicos.
 * "12h" cobre manhã+tarde (ou tarde+noite) → todos os três.
 * "24h" cobre tudo.
 * @param {string[]} disp
 * @returns {string[]}
 */
export function normalizarDisponibilidade(disp) {
  if (!disp) return [];
  const out = new Set();
  for (const d of disp) {
    const norm = normalizarTexto(d);
    if (norm === 'manha' || norm === 'manhã') out.add('manha');
    else if (norm === 'tarde') out.add('tarde');
    else if (norm === 'noite') out.add('noite');
    else if (norm === 'madrugada') out.add('madrugada');
    else if (norm === '12h') { out.add('manha'); out.add('tarde'); out.add('noite'); }
    else if (norm === '24h') { out.add('manha'); out.add('tarde'); out.add('noite'); out.add('madrugada'); }
  }
  return Array.from(out);
}

/**
 * Palavras estruturais que descrevem *como* a região é nomeada, e não
 * *qual* é a região. "Zona Sul" e "Zona Oeste" compartilham "zona" — se isso
 * contasse, as duas pareciam mais compatíveis do que "Zona Sul" e "Centro".
 */
const TOKENS_ESTRUTURAIS = new Set([
  'zona', 'bairro', 'regiao', 'area', 'cidade', 'municipio', 'estado', 'setor'
]);

/**
 * Separa uma região em UF e sub-região.
 * "Zona Sul - SP" → { uf: 'SP', sub: ['sul'] }
 * @param {string} regiao
 * @returns {{ uf: string|null, sub: string[] }|null}
 */
export function normalizarRegiao(regiao) {
  if (!regiao) return null;
  const norm = normalizarTexto(regiao);
  if (!norm) return null;

  const tokens = norm.split(/\s+/).filter(Boolean);
  let uf = null;
  const sub = [];

  for (const t of tokens) {
    if (t.length === 2 && UFS_VALIDAS.has(t.toUpperCase())) {
      uf = t.toUpperCase();
      continue;
    }
    // Ignora marcadores de separador ("de", "do", "da") e tokens muito curtos
    if (t.length > 2 && !['de', 'do', 'da', 'em'].includes(t) && !TOKENS_ESTRUTURAIS.has(t)) {
      sub.push(t);
    }
  }
  if (!uf && sub.length === 0) return null;
  return { uf, sub };
}

/**
 * Cobertura de um conjunto de tokens por outro: fração do conjunto menor
 * que aparece no maior. Para regiões nomeadas ("Jardim das Acácias" vs
 * "Jardim Maravilha") reflete melhor a proximidade do que Jaccard.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0.0 a 1.0
 */
function cobertura(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const menor = setA.size <= setB.size ? setA : setB;
  const maior = setA.size <= setB.size ? setB : setA;
  let inter = 0;
  for (const x of menor) if (maior.has(x)) inter++;
  return inter / menor.size;
}

/**
 * Compara a região da vaga com a região do profissional.
 *
 * Regras:
 *   - mesma UF            → 0.70 + 0.30 × cobertura(sub-região)
 *   - UFs diferentes      → 0.00 (atendimento domiciliar é local)
 *   - UF ausente em um dos lados → 0.50 × cobertura(sub-região)
 *
 * @param {string} regiaoVaga
 * @param {string} regiaoProf
 * @returns {{ pontos: number|null, tipo: 'compativel'|'parcial'|'diferente'|'indisponivel', ufIgual: boolean|null }}
 */
export function compararRegioes(regiaoVaga, regiaoProf) {
  const a = normalizarRegiao(regiaoVaga);
  const b = normalizarRegiao(regiaoProf);
  if (!a || !b) {
    return { pontos: null, tipo: 'indisponivel', ufIgual: null };
  }

  const sobreposicao = cobertura(a.sub, b.sub);

  if (a.uf && b.uf) {
    if (a.uf !== b.uf) {
      return { pontos: 0, tipo: 'diferente', ufIgual: false };
    }
    return { pontos: 0.70 + 0.30 * sobreposicao, tipo: 'compativel', ufIgual: true };
  }

  return { pontos: 0.50 * sobreposicao, tipo: 'parcial', ufIgual: null };
}

/**
 * Verifica quantas especialidades do profissional aparecem no texto da vaga.
 * @param {string[]} especialidades
 * @param {string} texto
 * @returns {string[]} especialidades encontradas
 */
function especialidadesAfins(especialidades, texto) {
  const norm = normalizarTexto(texto);
  if (!norm) return [];
  const achadas = [];
  for (const esp of especialidades) {
    const alvo = normalizarTexto(esp);
    if (!alvo || alvo.length < 3) continue;
    if (norm.includes(alvo)) {
      achadas.push(esp);
      continue;
    }
    // Match parcial por radical: "Alzheimer" ⊂ "doença de Alzheimer"
    const radical = alvo.slice(0, Math.max(4, Math.floor(alvo.length * 0.7)));
    if (radical.length >= 4 && norm.includes(radical)) achadas.push(esp);
  }
  return achadas;
}

/* ═══════════════════════════════ Cálculo ══════════════════════════════════ */

/**
 * Converte o histórico de contratos concluídos em uma nota de confiança.
 * Curva escalonada: 1 contrato já mostra experiência, mas a nota só satura
 * com 12+ atendimentos concluídos.
 * @param {number} n
 * @returns {number} 0.0 a 1.0
 */
function historicoTier(n) {
  if (!n || n <= 0) return 0;
  if (n === 1) return 0.3;
  if (n <= 3) return 0.5;
  if (n <= 6) return 0.7;
  if (n <= 12) return 0.85;
  return 1;
}

/**
 * Calcula o score de matching entre uma vaga e um profissional.
 *
 * @param {Object} vaga — linha da tabela `vagas`
 * @param {Object} profissional — { detalhes, stats }
 * @returns {Object} { score, motivos, motivosDetalhados }
 */
export function calcularScore(vaga, profissional) {
  const detalhes = profissional?.detalhes || {};
  const stats = profissional?.stats || {};

  /** @type {Array<{codigo:string, peso:number, pontos:number|null, detalhe:Object}>} */
  const criterios = [];
  const registrar = (codigo, peso, pontos, detalhe = {}) =>
    criterios.push({ codigo, peso, pontos, detalhe });

  /* 1. Profissão (peso 0.40) ------------------------------------------- */
  const profissaoVaga = resolverProfissao(vaga.profissional_desejado);
  const profissaoProf = inferirProfissao(detalhes);

  if (profissaoVaga && profissaoProf) {
    if (profissaoVaga === profissaoProf) {
      registrar('profissao_exata', PESOS.profissao, 1, { profissao: profissaoProf });
    } else {
      const comp = COMPATIBILIDADE[profissaoProf]?.[profissaoVaga]
        ?? COMPATIBILIDADE[profissaoVaga]?.[profissaoProf]
        ?? 0;
      if (comp > 0) {
        registrar('profissao_compativel', PESOS.profissao, comp, { profissao: profissaoProf });
      } else {
        registrar('profissao_diferente', PESOS.profissao, 0, { profissao: profissaoProf });
      }
    }
  } else {
    // Sem dado dos dois lados o critério não é avaliável.
    registrar('profissao_indisponivel', PESOS.profissao, null, {
      profissao: profissaoProf || undefined
    });
  }

  /* 2. Disponibilidade × jornada (peso 0.20) ---------------------------- */
  const turnosVaga = extrairTurnos(vaga.jornada_horario);
  const turnosProf = normalizarDisponibilidade(parseJsonArray(detalhes.disponibilidade));
  if (turnosVaga.length > 0 && turnosProf.length > 0) {
    const compat = turnosVaga.filter((t) => turnosProf.includes(t)).length;
    const ratio = compat / turnosVaga.length;
    if (ratio === 1) {
      registrar('disponibilidade_total', PESOS.disponibilidade, 1, { turnos: compat, total: turnosVaga.length });
    } else if (compat > 0) {
      registrar('disponibilidade_parcial', PESOS.disponibilidade, ratio, { turnos: compat, total: turnosVaga.length });
    } else {
      registrar('disponibilidade_incompativel', PESOS.disponibilidade, 0, { turnos: 0, total: turnosVaga.length });
    }
  } else {
    registrar('disponibilidade_indisponivel', PESOS.disponibilidade, null, {});
  }

  /* 3. Reputação (peso 0.15) -------------------------------------------- */
  // Confia em duas coisas: a nota média das avaliações e o histórico de
  // contratos concluídos. A nota entra com peso por confiança de amostra
  // (1 avaliação não pesa como 10) e o histórico cobre metade do critério —
  // num marketplace de cuidado, quem já atendeu 10 pacientes é um sinal
  // mais forte do que quem tem 3 avaliações.
  const media = Number(stats.media || 0);
  const totalAvaliacoes = Number(stats.total || 0);
  const vagasConcluidas = Number(stats.vagas_concluidas || 0);
  const historico = historicoTier(vagasConcluidas);

  if (totalAvaliacoes > 0) {
    const confianca = Math.min(1, totalAvaliacoes / 3);
    const notaPonderada = (media / 5) * (0.5 + 0.5 * confianca);
    const pontos = 0.6 * notaPonderada + 0.4 * historico;
    registrar('reputacao', PESOS.reputacao, pontos, {
      media, total: totalAvaliacoes, concluidas: vagasConcluidas
    });
  } else if (vagasConcluidas > 0) {
    // Sem avaliações, o histórico ainda vale — com desconto por falta de nota.
    registrar('reputacao_historico', PESOS.reputacao, 0.7 * historico, {
      media, total: 0, concluidas: vagasConcluidas
    });
  } else {
    registrar('reputacao_indisponivel', PESOS.reputacao, null, {});
  }

  /* 4. Afinidade de especialidade (peso 0.10) --------------------------- */
  const textoVaga = [vaga.servico_descricao, vaga.paciente_diagnostico, vaga.profissional_desejado]
    .filter(Boolean).join(' ');
  const especialidades = parseJsonArray(detalhes.especialidades);
  const afins = especialidadesAfins(especialidades, textoVaga);
  if (especialidades.length > 0) {
    if (afins.length > 0) {
      const pontos = Math.min(1, 0.6 + 0.2 * (afins.length - 1));
      registrar('especialidade_afim', PESOS.especialidade, pontos, {
        especialidade: afins[0],
        total: afins.length
      });
    } else {
      registrar('especialidade_sem_afinidade', PESOS.especialidade, 0, {});
    }
  } else {
    registrar('especialidade_indisponivel', PESOS.especialidade, null, {});
  }

  /* 5. Registro verificado (peso 0.05) ---------------------------------- */
  const estadoRegistro = Number(detalhes.registro_verificado || 0);
  if (estadoRegistro === 1) {
    registrar('registro_verificado', PESOS.registro, 1, {});
  } else if (estadoRegistro === 2) {
    registrar('registro_pendente', PESOS.registro, 0.3, {});
  } else {
    registrar('registro_nao_verificado', PESOS.registro, 0, {});
  }

  /* 6. Região (peso 0.10) ----------------------------------------------- */
  const regiao = compararRegioes(vaga.regiao, detalhes.regiao);
  if (regiao.pontos === null) {
    registrar('regiao_indisponivel', PESOS.regiao, null, {});
  } else if (regiao.tipo === 'diferente') {
    registrar('regiao_diferente', PESOS.regiao, 0, {
      regiaoVaga: vaga.regiao || '', regiaoProf: detalhes.regiao || ''
    });
  } else if (regiao.tipo === 'parcial') {
    registrar('regiao_parcial', PESOS.regiao, regiao.pontos, { regiao: detalhes.regiao || '' });
  } else {
    registrar('regiao_compativel', PESOS.regiao, regiao.pontos, { regiao: detalhes.regiao || '' });
  }

  /* Soma ponderada com redistribuição dos pesos indisponíveis ----------- */
  const pesoDisponivel = criterios
    .filter((c) => c.pontos !== null)
    .reduce((acc, c) => acc + c.peso, 0);

  let score = 0;
  if (pesoDisponivel > 0) {
    for (const c of criterios) {
      if (c.pontos === null) continue;
      score += (c.pontos * c.peso) / pesoDisponivel;
    }
  }
  score = Math.min(Math.max(score, 0), 1);

  const motivosDetalhados = criterios.map((c) => ({
    codigo: c.codigo,
    peso: c.peso,
    pontos: c.pontos === null ? null : Number((c.pontos * c.peso).toFixed(3)),
    detalhe: c.detalhe
  }));

  return {
    score: Number(score.toFixed(3)),
    motivos: motivosDetalhados
      .filter((m) => m.pontos !== null)
      .map((m) => `${m.codigo} (+${m.pontos.toFixed(2)})`),
    motivosDetalhados
  };
}

/**
 * Classifica o score em faixas legíveis.
 * @param {number} score
 * @returns {'alto'|'medio'|'baixo'}
 */
export function nivelDoScore(score) {
  if (score >= 0.7) return 'alto';
  if (score >= 0.45) return 'medio';
  return 'baixo';
}

/* ═══════════════════════════════ Recomendações ════════════════════════════ */

/**
 * GET /api/vagas/:id/recomendar
 * Retorna os top N profissionais recomendados para uma vaga, ordenados por score.
 *
 * @param {number} idVaga
 * @param {Object} opts — { limite: 10, minScore: 0.3 }
 * @returns {Object|null} { vaga_id, total, recomendacoes }
 */
export async function recomendarParaVaga(idVaga, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 10, 50);
  const minScore = Number(opts.minScore) || 0.3;

  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [idVaga]);
  if (!vaga) return null;

  const profissionais = await db.all(
    `SELECT u.id, u.nome, u.telefone, u.criado_em,
            d.id_user, d.diploma_url, d.diploma_verificado,
            d.registro_conselho, d.tipo_registro, d.registro_verificado,
            d.profissao, d.regiao,
            d.especialidades, d.disponibilidade, d.bio,
            (SELECT COALESCE(ROUND(AVG(nota), 2), 0) FROM avaliacoes WHERE id_profissional = u.id) AS media,
            (SELECT COUNT(*) FROM avaliacoes WHERE id_profissional = u.id) AS total_avaliacoes,
            (SELECT COUNT(*) FROM candidaturas c
               JOIN vagas v ON v.id = c.id_vaga
              WHERE c.id_profissional = u.id
                AND c.status_candidatura = 'aceita'
                AND v.status = 'fechada') AS vagas_concluidas
       FROM users u
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE u.tipo_usuario = 'profissional'
        AND u.suspended_at IS NULL`
  );

  // Não recomenda quem já se candidatou a esta vaga.
  const candidatos = await db.all(
    'SELECT id_profissional FROM candidaturas WHERE id_vaga = ?',
    [idVaga]
  );
  const jaCandidatados = new Set(candidatos.map((c) => c.id_profissional));

  const recomendacoes = [];
  for (const p of profissionais) {
    if (jaCandidatados.has(p.id)) continue;

    const detalhes = {
      ...p,
      especialidades: parseJsonArray(p.especialidades),
      disponibilidade: parseJsonArray(p.disponibilidade)
    };

    const { score, motivos, motivosDetalhados } = calcularScore(vaga, {
      detalhes,
      stats: {
        media: p.media || 0,
        total: p.total_avaliacoes || 0,
        vagas_concluidas: p.vagas_concluidas || 0
      }
    });

    if (score >= minScore) {
      recomendacoes.push({
        profissional: {
          id: p.id,
          nome: p.nome,
          telefone: p.telefone,
          profissao: inferirProfissao(detalhes),
          regiao: p.regiao || null,
          registro_conselho: p.registro_conselho,
          tipo_registro: p.tipo_registro,
          registro_verificado: p.registro_verificado,
          diploma_verificado: p.diploma_verificado,
          especialidades: detalhes.especialidades,
          disponibilidade: detalhes.disponibilidade,
          bio: p.bio,
          media_avaliacao: p.media || 0,
          total_avaliacoes: p.total_avaliacoes || 0
        },
        score,
        nivel: nivelDoScore(score),
        motivos,
        motivosDetalhados
      });
    }
  }

  recomendacoes.sort((a, b) => b.score - a.score);

  return {
    vaga_id: Number(idVaga),
    total: recomendacoes.length,
    pesos: PESOS,
    recomendacoes: recomendacoes.slice(0, limite)
  };
}

/**
 * GET /api/profissionais/me/recomendar
 * Retorna as top N vagas ativas recomendadas para um profissional, ordenadas por score.
 *
 * @param {number} idProf
 * @param {Object} opts — { limite: 10, minScore: 0.3 }
 * @returns {Object|null} { profissional_id, total, recomendacoes }
 */
export async function recomendarParaProfissional(idProf, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 10, 50);
  const minScore = Number(opts.minScore) || 0.3;

  const prof = await db.get(
    `SELECT u.id, u.nome, d.*
       FROM users u
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE u.id = ? AND u.tipo_usuario = 'profissional'`,
    [idProf]
  );
  if (!prof) return null;

  const detalhes = {
    ...prof,
    especialidades: parseJsonArray(prof.especialidades),
    disponibilidade: parseJsonArray(prof.disponibilidade)
  };

  const stats = await db.get(
    `SELECT COALESCE(ROUND(AVG(nota), 2), 0) AS media, COUNT(*) AS total
       FROM avaliacoes WHERE id_profissional = ?`,
    [idProf]
  );

  const historico = await db.get(
    `SELECT COUNT(*) AS n
       FROM candidaturas c
       JOIN vagas v ON v.id = c.id_vaga
      WHERE c.id_profissional = ?
        AND c.status_candidatura = 'aceita'
        AND v.status = 'fechada'`,
    [idProf]
  );

  const profissional = {
    detalhes,
    stats: {
      media: stats?.media || 0,
      total: stats?.total || 0,
      vagas_concluidas: historico?.n || 0
    }
  };

  const vagas = await db.all(
    `SELECT v.* FROM vagas v
      WHERE v.status = 'ativa'
        AND v.id NOT IN (
          SELECT id_vaga FROM candidaturas WHERE id_profissional = ?
        )
      ORDER BY v.criado_em DESC
      LIMIT 200`,
    [idProf]
  );

  const recomendacoes = [];
  for (const vaga of vagas) {
    const { score, motivos, motivosDetalhados } = calcularScore(vaga, profissional);
    if (score >= minScore) {
      recomendacoes.push({
        vaga: {
          id: vaga.id,
          profissional_desejado: vaga.profissional_desejado,
          complexidade: vaga.complexidade,
          regiao: vaga.regiao,
          remuneracao_valor: vaga.remuneracao_valor,
          remuneracao_tipo: vaga.remuneracao_tipo,
          tipo_contrato: vaga.tipo_contrato,
          servico_descricao: vaga.servico_descricao,
          jornada_horario: vaga.jornada_horario,
          jornada_escala: vaga.jornada_escala,
          criado_em: vaga.criado_em
        },
        score,
        nivel: nivelDoScore(score),
        motivos,
        motivosDetalhados
      });
    }
  }

  recomendacoes.sort((a, b) => b.score - a.score);

  return {
    profissional_id: Number(idProf),
    total: recomendacoes.length,
    pesos: PESOS,
    recomendacoes: recomendacoes.slice(0, limite)
  };
}
