/**
 * services/matching.js
 *
 * Sistema de matching automático entre profissionais e vagas.
 *
 * Algoritmo: pontua cada (profissional, vaga) com base em:
 *   - Tipo de profissional desejado vs especialidades declaradas (texto)
 *   - Sobreposição de disponibilidade (manhã/tarde/noite/12h/24h) com jornada
 *   - Boost por registro_verificado (selo verde) — confiança
 *   - Boost por avaliação média (estrelas) — reputação
 *   - Penalidade por distância geográfica (região compatível)
 *
 * Score final é 0.0 a 1.0. Acima de 0.6 = recomendado.
 *
 * Endpoints que usam este serviço:
 *   GET /api/vagas/:id/recomendar  → top N profissionais para uma vaga
 *   GET /api/profissionais/:id/recomendar  → top N vagas para um profissional (futuro)
 *
 * Não há mudança de contrato — matching automático é opcional e aditivo.
 * O fluxo manual (filtrar + candidatar) continua funcionando.
 */
import db from '../db/driver.js';

/**
 * Dicionário de equivalências de texto — converte variações de entrada
 * para tokens canônicos antes de comparar.
 *
 * Ex: "Cuidador de Idosos", "cuidador", "Cuidador" → "cuidador"
 * Ex: "Fisioterapeuta", "fisio", "Fisio" → "fisioterapeuta"
 */
const SINONIMOS = {
  cuidador: 'cuidador',
  cuidadora: 'cuidador',
  'cuidador de idosos': 'cuidador',
  'cuidador de idosa': 'cuidador',
  acompanhante: 'cuidador',
  enfermeiro: 'enfermeiro',
  enfermeira: 'enfermeiro',
  'tecnico de enfermagem': 'tecnico_enfermagem',
  'tecnica de enfermagem': 'tecnico_enfermagem',
  tecnico_enfermagem: 'tecnico_enfermagem',
  fisioterapeuta: 'fisioterapeuta',
  fisio: 'fisioterapeuta',
  'fisio domiciliar': 'fisioterapeuta',
  psicologo: 'psicologo',
  psicologa: 'psicologo',
  'terapeuta ocupacional': 'terapeuta_ocupacional',
  to: 'terapeuta_ocupacional',
  nutricionista: 'nutricionista',
  medico: 'medico',
  medica: 'medico'
};

/**
 * Normaliza um texto removendo acentos, lowercasing e aplicando sinônimos.
 * @param {string} texto
 * @returns {string} texto canônico
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tokeniza e mapeia para canônico. Se o texto inteiro tem sinônimo, usa.
 * Senão, mapeia palavra por palavra.
 */
function tokenizar(texto) {
  const norm = normalizarTexto(texto);
  if (!norm) return [];
  // Se o texto inteiro tem sinônimo direto
  if (SINONIMOS[norm]) return [SINONIMOS[norm]];
  // Senão, parte em palavras e mapeia cada uma
  return norm
    .split(/\s+/)
    .map(p => SINONIMOS[p] || p)
    .filter(p => p.length > 2);  // ignora "de", "da", "e", etc.
}

/**
 * Calcula coeficiente Jaccard entre dois conjuntos (interseção / união).
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0.0 a 1.0
 */
function jaccard(a, b) {
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
 * "08h-20h" → ['manha', 'tarde']
 */
function extrairTurnos(horario) {
  if (!horario) return [];
  const norm = normalizarTexto(horario);
  const turnos = new Set();
  // Extrai horas: "08h", "18h", "20h"
  const horas = norm.match(/\d{1,2}h/g)?.map(h => parseInt(h, 10)) || [];
  if (horas.length >= 2) {
    const [inicio, fim] = horas;
    // Vai do início até o fim (com wrap se fim < inicio, ex: 20h-08h)
    let h = inicio;
    const end = fim < inicio ? fim + 24 : fim;
    while (h < end) {
      const hh = h % 24;
      if (hh >= 6 && hh < 12) turnos.add('manha');
      else if (hh >= 12 && hh < 18) turnos.add('tarde');
      else if (hh >= 18 && hh < 24) turnos.add('noite');
      else turnos.add('madrugada');
      h++;
    }
  }
  // Também detecta palavras-chave
  if (/\bmanha\b/.test(norm)) turnos.add('manha');
  if (/\btarde\b/.test(norm)) turnos.add('tarde');
  if (/\bnoite\b/.test(norm)) turnos.add('noite');
  if (/\bmadrugada\b/.test(norm)) turnos.add('madrugada');
  return Array.from(turnos);
}

/**
 * Mapeia disponibilidade para turnos canônicos.
 * "manha", "tarde", "noite", "12h", "24h" → "manha" | "tarde" | "noite" | "madrugada"
 * "12h" = cobre manhã+tarde (12h diurnas) ou tarde+noite (12h noturnas)
 * "24h" = cobre tudo
 */
function normalizarDisponibilidade(disp) {
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
 * Calcula o score de matching entre uma vaga e um profissional.
 *
 * @param {Object} vaga - vaga do banco
 * @param {Object} profissional - { detalhes, stats }
 * @returns {Object} { score: 0-1, motivos: string[] }
 */
export function calcularScore(vaga, profissional) {
  const motivos = [];
  let score = 0;
  const maxScore = 1.0;

  // 1. Matching de tipo de profissional (peso: 0.40)
  //    "profissional_desejado" da vaga vs "especialidades" do profissional
  const vagaTokens = tokenizar(vaga.profissional_desejado);
  let profTokens = [];
  if (profissional.detalhes?.especialidades) {
    try {
      const esp = typeof profissional.detalhes.especialidades === 'string'
        ? JSON.parse(profissional.detalhes.especialidades)
        : profissional.detalhes.especialidades;
      profTokens = esp.flatMap(e => tokenizar(e));
    } catch {}
  }
  // Também considera o tipo_registro (COREN, CRM, etc.)
  if (profissional.detalhes?.tipo_registro) {
    profTokens.push(...tokenizar(profissional.detalhes.tipo_registro));
  }
  const overlap = jaccard(vagaTokens, profTokens);
  const pontosTipo = overlap * 0.40;
  score += pontosTipo;
  if (overlap > 0) {
    motivos.push(`Tipo: ${Math.round(overlap * 100)}% match`);
  } else {
    motivos.push('Tipo: sem overlap direto');
  }

  // 2. Disponibilidade vs jornada (peso: 0.20)
  const turnosVaga = extrairTurnos(vaga.jornada_horario);
  let dispProf = [];
  if (profissional.detalhes?.disponibilidade) {
    try {
      const d = typeof profissional.detalhes.disponibilidade === 'string'
        ? JSON.parse(profissional.detalhes.disponibilidade)
        : profissional.detalhes.disponibilidade;
      dispProf = normalizarDisponibilidade(d);
    } catch {}
  }
  // Se vaga não tem horário definido ou profissional não tem disponibilidade,
  // não penaliza — apenas não pontua.
  if (turnosVaga.length > 0 && dispProf.length > 0) {
    const turnosMatch = turnosVaga.filter(t => dispProf.includes(t)).length;
    const dispOverlap = turnosMatch / turnosVaga.length;
    score += dispOverlap * 0.20;
    if (dispOverlap > 0) {
      motivos.push(`Disponibilidade: ${turnosMatch}/${turnosVaga.length} turnos`);
    } else {
      motivos.push('Disponibilidade: turnos incompatíveis');
    }
  } else {
    motivos.push('Disponibilidade: não avaliada');
  }

  // 3. Boost por registro_verificado (peso: 0.15)
  if (profissional.detalhes?.registro_verificado === 1) {
    score += 0.15;
    motivos.push('Registro verificado (+0.15)');
  }

  // 4. Boost por avaliação média (peso: 0.15, proporcional)
  //    media 5.0 → 0.15, media 4.0 → 0.12, media 3.0 → 0.09
  const media = profissional.stats?.media || 0;
  const total = profissional.stats?.total || 0;
  if (total > 0) {
    const pontosAvaliacao = (media / 5) * 0.15;
    score += pontosAvaliacao;
    motivos.push(`Avaliação: ${media.toFixed(1)}★ em ${total} reviews (+${pontosAvaliacao.toFixed(2)})`);
  } else {
    motivos.push('Sem avaliações');
  }

  // 5. Penalidade por região (peso: 0.10 — região compatível = 0.10)
  //    Comparação simples: se a região da vaga contém palavras-chave
  //    presentes na região do profissional (se houvesse campo). Hoje
  //    só damos 0.10 se a vaga tem região definida (qualquer profissional
  //    da mesma UF vale). Como não temos UF do profissional, fica 0.05 fixo.
  if (vaga.regiao) {
    score += 0.05;
    motivos.push('Região: vaga tem local definido (+0.05)');
  }

  // Clamp 0-1
  score = Math.min(Math.max(score, 0), maxScore);

  return { score: Number(score.toFixed(3)), motivos };
}

/**
 * GET /api/vagas/:id/recomendar
 * Retorna os top N profissionais recomendados para uma vaga, ordenados por score.
 *
 * @param {number} idVaga
 * @param {Object} opts - { limite: 10, minScore: 0.3 }
 * @returns {Object} { vaga_id, recomendacoes: [{ profissional, score, motivos }] }
 */
export async function recomendarParaVaga(idVaga, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 10, 50);
  const minScore = Number(opts.minScore) || 0.3;

  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [idVaga]);
  if (!vaga) return null;

  // Lista todos os profissionais ativos com seus detalhes
  const profissionais = await db.all(
    `SELECT u.id, u.nome, u.telefone, u.criado_em,
            d.id_user, d.diploma_url, d.diploma_verificado,
            d.registro_conselho, d.tipo_registro, d.registro_verificado,
            d.especialidades, d.disponibilidade, d.bio,
            (SELECT COALESCE(ROUND(AVG(nota), 2), 0) FROM avaliacoes WHERE id_profissional = u.id) AS media,
            (SELECT COUNT(*) FROM avaliacoes WHERE id_profissional = u.id) AS total_avaliacoes
       FROM users u
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE u.tipo_usuario = 'profissional'
        AND u.suspended_at IS NULL`
  );

  // Filtra profissionais que já se candidataram a esta vaga (não recomenda duplicar)
  const candidatos = await db.all(
    'SELECT id_profissional FROM candidaturas WHERE id_vaga = ?',
    [idVaga]
  );
  const jaCandidatados = new Set(candidatos.map(c => c.id_profissional));

  const recomendacoes = [];
  for (const p of profissionais) {
    if (jaCandidatados.has(p.id)) continue;

    // Parse JSON fields
    try { p.especialidades = JSON.parse(p.especialidades || '[]'); } catch { p.especialidades = []; }
    try { p.disponibilidade = JSON.parse(p.disponibilidade || '[]'); } catch { p.disponibilidade = []; }

    const { score, motivos } = calcularScore(vaga, {
      detalhes: p,
      stats: { media: p.media || 0, total: p.total_avaliacoes || 0 }
    });

    if (score >= minScore) {
      recomendacoes.push({
        profissional: {
          id: p.id,
          nome: p.nome,
          telefone: p.telefone,
          registro_conselho: p.registro_conselho,
          tipo_registro: p.tipo_registro,
          registro_verificado: p.registro_verificado,
          diploma_verificado: p.diploma_verificado,
          especialidades: p.especialidades,
          disponibilidade: p.disponibilidade,
          bio: p.bio,
          media_avaliacao: p.media || 0,
          total_avaliacoes: p.total_avaliacoes || 0
        },
        score,
        motivos
      });
    }
  }

  // Ordena por score desc
  recomendacoes.sort((a, b) => b.score - a.score);

  return {
    vaga_id: idVaga,
    total: recomendacoes.length,
    recomendacoes: recomendacoes.slice(0, limite)
  };
}

/**
 * GET /api/profissionais/:id/recomendar
 * Retorna as top N vagas ativas recomendadas para um profissional, ordenadas por score.
 *
 * @param {number} idProf
 * @param {Object} opts - { limite: 10, minScore: 0.3 }
 */
export async function recomendarParaProfissional(idProf, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 10, 50);
  const minScore = Number(opts.minScore) || 0.3;

  // Busca o profissional + detalhes + stats
  const prof = await db.get(
    `SELECT u.id, d.*
       FROM users u
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE u.id = ? AND u.tipo_usuario = 'profissional'`,
    [idProf]
  );
  if (!prof) return null;

  try { prof.especialidades = JSON.parse(prof.especialidades || '[]'); } catch { prof.especialidades = []; }
  try { prof.disponibilidade = JSON.parse(prof.disponibilidade || '[]'); } catch { prof.disponibilidade = []; }

  const stats = await db.get(
    `SELECT COALESCE(ROUND(AVG(nota), 2), 0) AS media, COUNT(*) AS total
       FROM avaliacoes WHERE id_profissional = ?`,
    [idProf]
  );

  const profissional = {
    detalhes: prof,
    stats: { media: stats?.media || 0, total: stats?.total || 0 }
  };

  // Lista vagas ativas que o profissional ainda não se candidatou
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
    const { score, motivos } = calcularScore(vaga, profissional);
    if (score >= minScore) {
      recomendacoes.push({
        vaga: {
          id: vaga.id,
          profissional_desejado: vaga.profissional_desejado,
          complexidade: vaga.complexidade,
          regiao: vaga.regiao,
          remuneracao_valor: vaga.remuneracao_valor,
          remuneracao_tipo: vaga.remuneracao_tipo,
          servico_descricao: vaga.servico_descricao,
          jornada_horario: vaga.jornada_horario,
          jornada_escala: vaga.jornada_escala,
          criado_em: vaga.criado_em
        },
        score,
        motivos
      });
    }
  }

  recomendacoes.sort((a, b) => b.score - a.score);

  return {
    profissional_id: idProf,
    total: recomendacoes.length,
    recomendacoes: recomendacoes.slice(0, limite)
  };
}
