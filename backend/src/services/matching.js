/**
 * services/matching.js
 *
 * Sistema de matching automático entre profissionais e vagas.
 *
 * ── Evolução ────────────────────────────────────────────────────────────
 *
 * A primeira versão (main) pontuava só DOIS critérios: cidade (0.50) e
 * carga horária (0.50). Isso ignorava a informação mais importante de
 * qualquer marketplace de cuidado — **a profissão**. Duas pessoas podem
 * morar na mesma cidade e ter a mesma disponibilidade, e uma ser enfermeira
 * enquanto a outra é fisioterapeuta: para a vaga, só uma serve.
 *
 * A versão anterior (branch recovery) tentava comparar a profissão da vaga
 * com as *especialidades* do profissional, mas `especialidades` guarda foco
 * clínico (Alzheimer, Geriatria), não a profissão — e sem stemming
 * ("fisioterapia" ≠ "fisioterapeuta") o critério nunca pontuava. O critério
 * de maior peso era sempre 0.
 *
 * Esta versão usa a taxonomia canônica de `services/profissoes.js` (a fonte
 * da verdade, compartilhada com o resto do backend) e pontua seis critérios
 * que somam 1.0:
 *
 *   Profissão 0.40 · Disponibilidade 0.20 · Reputação 0.15 ·
 *   Especialidade 0.10 · Região 0.10 · Registro 0.05
 *
 * Critérios sem dado (perfil incompleto) têm o peso redistribuído
 * proporcionalmente entre os demais — assim o score final continua numa
 * escala 0.0–1.0 interpretável mesmo quando faltam informações.
 *
 * Os motivos saem ESTRUTURADOS (`codigo` + `detalhe`) para que o frontend
 * os traduza (pt-BR / es / en) em vez de o backend fixar texto em português.
 */
import db from '../db/driver.js';
import {
  PROFISSOES,
  UFS_VALIDAS,
  normalizarProfissao,
  compatibilidadeEntre
} from './profissoes.js';

/* ═════════════════════════════ Pesos dos critérios ════════════════════════ */

export const PESOS = {
  profissao:      0.40,  // profissão canônica confere
  disponibilidade: 0.20, // sobreposição de turnos
  reputacao:      0.15,  // média de avaliações + contratos concluídos
  especialidade:  0.10,  // afinidade entre especialidades e o texto da vaga
  regiao:         0.10,  // proximidade geográfica (cidade / UF)
  registro:       0.05   // selo de registro profissional
};

/* ═══════════════════════════════ Utilidades ════════════════════════════════ */

/** Nome do estado → UF. Usado para comparar "São Paulo" com "SP". */
const UF_POR_NOME = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'bahia': 'BA', 'ceara': 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'para': 'PA', 'parana': 'PR', 'paraiba': 'PB',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE',
  'tocantins': 'TO'
};

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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Cobertura de um conjunto de tokens por outro: fração do conjunto menor
 * que aparece no maior.
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
 * Extrai a UF de um texto de localização.
 * "Zona Sul - SP" → SP · "São Paulo" → SP · "Campinas" → null
 * @param {string} texto
 * @returns {string|null}
 */
export function extrairUF(texto) {
  if (!texto) return null;
  const norm = normalizarTexto(texto);
  if (!norm) return null;

  // UF explícita no fim: "Zona Sul - SP", "sp"
  const m = norm.match(/\b([a-z]{2})\s*$/);
  if (m && UFS_VALIDAS.includes(m[1].toUpperCase())) return m[1].toUpperCase();

  // Nome do estado por extenso: "São Paulo" → SP
  if (UF_POR_NOME[norm]) return UF_POR_NOME[norm];

  return null;
}

/**
 * Tokens significativos de um local, sem a UF e sem o nome do estado.
 * @param {string} texto
 * @returns {string[]}
 */
function tokensLocal(texto) {
  const norm = normalizarTexto(texto);
  if (!norm) return [];
  const uf = extrairUF(texto);
  const porNome = UF_POR_NOME[norm];
  return norm
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter((t) => !(t.length === 2 && UFS_VALIDAS.includes(t.toUpperCase())))
    .filter((t) => !porNome || norm !== porNome);
}

/**
 * Compara a localização da vaga com a do profissional.
 *
 * Regras:
 *   - nomes iguais                       → 1.00
 *   - um contém o outro ("São Paulo" ⊂
 *     "São Paulo - Centro")              → 0.70 + 0.30 × cobertura
 *   - mesma UF, nomes diferentes         → 0.60 + 0.40 × cobertura
 *   - UFs diferentes                     → 0.00 (atendimento é local)
 *   - sem dado de um dos lados           → indisponível
 *
 * @param {Object} vaga
 * @param {Object} detalhes
 * @returns {{ pontos: number|null, tipo: string }}
 */
export function compararLocalizacoes(vaga, detalhes) {
  // A vaga tem `cidade` (coluna nova) e `regiao` (texto livre, ex.: "Zona Sul - SP").
  const cidadeVaga = vaga.cidade || null;
  const regiaoVaga = vaga.regiao || null;
  const cidadeProf = detalhes.cidade || null;

  if (!cidadeProf || (!cidadeVaga && !regiaoVaga)) {
    return { pontos: null, tipo: 'indisponivel' };
  }

  // UF da vaga: explícita em regiao_uf, ou extraída do texto.
  const ufVaga = vaga.regiao_uf || extrairUF(regiaoVaga) || extrairUF(cidadeVaga);
  const ufProf = extrairUF(cidadeProf);

  const nomeVaga = normalizarTexto(cidadeVaga || regiaoVaga);
  const nomeProf = normalizarTexto(cidadeProf);

  if (nomeVaga && nomeVaga === nomeProf) {
    return { pontos: 1, tipo: 'compativel' };
  }

  if (ufVaga && ufProf && ufVaga !== ufProf) {
    return { pontos: 0, tipo: 'diferente' };
  }

  const sobreposicao = cobertura(tokensLocal(cidadeVaga || regiaoVaga), tokensLocal(cidadeProf));

  if (nomeVaga.includes(nomeProf) || nomeProf.includes(nomeVaga)) {
    return { pontos: 0.70 + 0.30 * sobreposicao, tipo: 'compativel' };
  }

  if (ufVaga && ufProf && ufVaga === ufProf) {
    return { pontos: 0.60 + 0.40 * sobreposicao, tipo: 'parcial' };
  }

  // Nomes diferentes e sem UF em comum (ou UFs diferentes) — não dá para
  // assumir proximidade: atendimento domiciliar é local.
  return { pontos: 0, tipo: 'diferente' };
}

/**
 * Detecta turnos a partir de uma string de horário/carga horária.
 * "08h às 18h" → ['manha', 'tarde'] · "20h às 08h" → ['noite', 'madrugada']
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
  if (/\bplantao\b/.test(norm)) {
    if (/\bnoturno\b/.test(norm)) { turnos.add('noite'); turnos.add('madrugada'); }
    else { turnos.add('manha'); turnos.add('tarde'); }
  }
  if (/\b12h\b|\b12x36\b|\b12 x 36\b/.test(norm)) {
    turnos.add('manha'); turnos.add('tarde'); turnos.add('noite');
  }
  if (/\b24h\b|\b24 horas\b|\bintegral\b/.test(norm)) {
    turnos.add('manha'); turnos.add('tarde'); turnos.add('noite'); turnos.add('madrugada');
  }

  return Array.from(turnos);
}

/**
 * Mapeia disponibilidade para turnos canônicos.
 * "12h" → manhã+tarde+noite · "24h" → todos.
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
 * Converte o histórico de contratos concluídos em uma nota de confiança.
 * Curva escalonada: 1 contrato já mostra experiência, mas a nota satura
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
 * Verifica quantas especialidades do profissional aparecem no texto da vaga.
 * @param {string[]} especialidades
 * @param {string} texto
 * @returns {string[]}
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
    // Match por radical: "Alzheimer" ⊂ "doença de Alzheimer"
    const radical = alvo.slice(0, Math.max(4, Math.floor(alvo.length * 0.7)));
    if (radical.length >= 4 && norm.includes(radical)) achadas.push(esp);
  }
  return achadas;
}

/**
 * Infere a profissão do profissional quando `profissao` não foi informada:
 * 1) campo declarado · 2) conselho (tipo_registro) · 3) especialidades.
 * @param {Object} detalhes
 * @returns {string|null}
 */
export function inferirProfissao(detalhes) {
  if (!detalhes) return null;

  const declarada = String(detalhes.profissao || '').trim();
  if (declarada) {
    if (PROFISSOES.some((p) => p.id === declarada)) return declarada;
    const r = normalizarProfissao(declarada);
    if (r.matched) return r.id;
  }

  // Fallback: conselho (COREN → enfermeiro, CREFITO → fisioterapeuta, ...)
  const conselho = String(detalhes.tipo_registro || '').toUpperCase();
  const porConselho = PROFISSOES.find((p) => p.conselho === conselho);
  if (porConselho) return porConselho.id;

  // Último recurso: alguma especialidade que seja uma profissão.
  for (const esp of parseJsonArray(detalhes.especialidades)) {
    const r = normalizarProfissao(esp);
    if (r.matched) return r.id;
  }

  return null;
}

/* ═══════════════════════════════ Cálculo ══════════════════════════════════ */

/**
 * Calcula o score de matching entre uma vaga e um profissional.
 *
 * @param {Object} vaga — linha da tabela `vagas`
 * @param {Object} profissional — { detalhes, stats }
 * @returns {{ score: number, motivos: string[], motivosDetalhados: Object[] }}
 */
export function calcularScore(vaga, profissional) {
  const detalhes = profissional?.detalhes || {};
  const stats = profissional?.stats || {};

  /** @type {Array<{codigo:string, peso:number, pontos:number|null, detalhe:Object}>} */
  const criterios = [];
  const registrar = (codigo, peso, pontos, detalhe = {}) =>
    criterios.push({ codigo, peso, pontos, detalhe });

  /* 1. Profissão (peso 0.40) ------------------------------------------- */
  const profissaoVaga = normalizarProfissao(vaga.profissional_desejado).id;
  const profissaoProf = inferirProfissao(detalhes);

  if (profissaoVaga && profissaoProf) {
    const comp = compatibilidadeEntre(profissaoProf, profissaoVaga);
    if (comp >= 1) {
      registrar('profissao_exata', PESOS.profissao, 1, { profissao: profissaoProf });
    } else if (comp > 0) {
      registrar('profissao_compativel', PESOS.profissao, comp, { profissao: profissaoProf });
    } else {
      registrar('profissao_diferente', PESOS.profissao, 0, { profissao: profissaoProf });
    }
  } else {
    registrar('profissao_indisponivel', PESOS.profissao, null, {
      profissao: profissaoProf || undefined
    });
  }

  /* 2. Disponibilidade × jornada (peso 0.20) ---------------------------- */
  // A vaga tem `carga_horaria` (coluna nova) e `jornada_horario` (histórico).
  const carga = vaga.carga_horaria || vaga.jornada_horario || vaga.jornada_escala;
  const turnosVaga = extrairTurnos(carga);
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
        especialidade: afins[0], total: afins.length
      });
    } else {
      registrar('especialidade_sem_afinidade', PESOS.especialidade, 0, {});
    }
  } else {
    registrar('especialidade_indisponivel', PESOS.especialidade, null, {});
  }

  /* 5. Região / cidade (peso 0.10) -------------------------------------- */
  const local = compararLocalizacoes(vaga, detalhes);
  if (local.pontos === null) {
    registrar('regiao_indisponivel', PESOS.regiao, null, {});
  } else if (local.tipo === 'diferente') {
    registrar('regiao_diferente', PESOS.regiao, 0, {
      regiao: detalhes.cidade || '',
      regiaoVaga: vaga.cidade || vaga.regiao || ''
    });
  } else if (local.tipo === 'parcial') {
    registrar('regiao_parcial', PESOS.regiao, local.pontos, { regiao: detalhes.cidade || '' });
  } else {
    registrar('regiao_compativel', PESOS.regiao, local.pontos, { regiao: detalhes.cidade || '' });
  }

  /* 6. Registro verificado (peso 0.05) ---------------------------------- */
  const estadoRegistro = Number(detalhes.registro_verificado || 0);
  if (estadoRegistro === 1) {
    registrar('registro_verificado', PESOS.registro, 1, {});
  } else if (estadoRegistro === 2) {
    registrar('registro_pendente', PESOS.registro, 0.3, {});
  } else {
    registrar('registro_nao_verificado', PESOS.registro, 0, {});
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
 * @returns {Object|null} { vaga_id, total, pesos, recomendacoes }
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
            d.profissao, d.cidade,
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
          cidade: p.cidade || null,
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
 * Retorna as top N vagas ativas recomendadas para um profissional.
 *
 * @param {number} idProf
 * @param {Object} opts — { limite: 10, minScore: 0.3 }
 * @returns {Object|null} { profissional_id, total, pesos, recomendacoes }
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
          cidade: vaga.cidade,
          regiao: vaga.regiao,
          carga_horaria: vaga.carga_horaria,
          jornada_horario: vaga.jornada_horario,
          jornada_escala: vaga.jornada_escala,
          remuneracao_valor: vaga.remuneracao_valor,
          remuneracao_tipo: vaga.remuneracao_tipo,
          tipo_contrato: vaga.tipo_contrato,
          servico_descricao: vaga.servico_descricao,
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
