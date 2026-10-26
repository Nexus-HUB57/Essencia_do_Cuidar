/**
 * services/matching.js
 *
 * Sistema de matching simplificado — apenas 2 critérios:
 *   1. Cidade (peso 0.50) — match exato ou parcial
 *   2. Carga horária (peso 0.50) — match de turnos (manhã/tarde/noite/12h/24h)
 *
 * Score final: 0.0 a 1.0
 *   - Cidade igual: +0.50
 *   - Cidade parcial (mesma região): +0.25
 *   - Carga horária compatível: +0.50
 *   - Carga horária parcial: +0.25
 *
 * Acima de 0.3 = recomendado.
 */
import db from '../db/driver.js';

/**
 * Normaliza texto: remove acentos, lowercase, trim
 */
function normalizar(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extrai turnos de uma string de carga horária.
 * "08h às 18h" → ['manha', 'tarde']
 * "20h às 08h" → ['noite', 'madrugada']
 * "12x36" → ['manha', 'tarde', 'noite']
 * "24h" → ['manha', 'tarde', 'noite', 'madrugada']
 * "Plantão noturno" → ['noite']
 */
function extrairTurnos(cargaHoraria) {
  if (!cargaHoraria) return [];
  const norm = normalizar(cargaHoraria);
  const turnos = new Set();

  // Detecta palavras-chave
  if (/\bmanha\b|\bmanhã\b/.test(norm)) turnos.add('manha');
  if (/\btarde\b/.test(norm)) turnos.add('tarde');
  if (/\bnoite\b/.test(norm)) turnos.add('noite');
  if (/\bmadrugada\b|\bdawn\b/.test(norm)) turnos.add('madrugada');
  if (/\bplantao\b|\bplantão\b/.test(norm)) {
    // Plantão geralmente cobre múltiplos turnos
    if (/\bnoturno\b/.test(norm)) { turnos.add('noite'); turnos.add('madrugada'); }
    else { turnos.add('manha'); turnos.add('tarde'); }
  }
  if (/\b12h\b|\b12x36\b|\b12 x 36\b/.test(norm)) {
    turnos.add('manha'); turnos.add('tarde'); turnos.add('noite');
  }
  if (/\b24h\b|\b24 horas\b|\bintegral\b/.test(norm)) {
    turnos.add('manha'); turnos.add('tarde'); turnos.add('noite'); turnos.add('madrugada');
  }

  // Extrai horas de "08h às 18h" ou "20h-08h"
  const horas = norm.match(/\d{1,2}h/g)?.map(h => parseInt(h)) || [];
  if (horas.length >= 2) {
    let [inicio, fim] = horas;
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

  return Array.from(turnos);
}

/**
 * Calcula o score de matching entre uma vaga e um profissional.
 * Apenas 2 critérios: cidade + carga horária.
 *
 * @param {Object} vaga - vaga do banco (com cidade + carga_horaria)
 * @param {Object} profissional - { detalhes }
 * @returns {Object} { score: 0-1, motivos: string[] }
 */
export function calcularScore(vaga, profissional) {
  const motivos = [];
  let score = 0;

  // 1. CIDADE (peso 0.50)
  const vagaCidade = normalizar(vaga.cidade);
  const profCidade = normalizar(profissional.detalhes?.cidade);
  if (vagaCidade && profCidade) {
    if (vagaCidade === profCidade) {
      score += 0.50;
      motivos.push('Cidade: match exato (+0.50)');
    } else if (vagaCidade.includes(profCidade) || profCidade.includes(vagaCidade)) {
      score += 0.25;
      motivos.push('Cidade: match parcial (+0.25)');
    } else {
      motivos.push('Cidade: sem match');
    }
  } else {
    motivos.push('Cidade: não informada');
  }

  // 2. CARGA HORÁRIA (peso 0.50)
  const vagaTurnos = extrairTurnos(vaga.carga_horaria);
  let profTurnos = [];
  if (profissional.detalhes?.disponibilidade) {
    try {
      const d = typeof profissional.detalhes.disponibilidade === 'string'
        ? JSON.parse(profissional.detalhes.disponibilidade)
        : profissional.detalhes.disponibilidade;
      profTurnos = normalizarDisponibilidade(d);
    } catch {}
  }

  if (vagaTurnos.length > 0 && profTurnos.length > 0) {
    const turnosMatch = vagaTurnos.filter(t => profTurnos.includes(t)).length;
    if (turnosMatch === vagaTurnos.length) {
      score += 0.50;
      motivos.push(`Carga horária: ${turnosMatch}/${vagaTurnos.length} turnos compatíveis (+0.50)`);
    } else if (turnosMatch > 0) {
      score += 0.25;
      motivos.push(`Carga horária: ${turnosMatch}/${vagaTurnos.length} turnos compatíveis (+0.25)`);
    } else {
      motivos.push('Carga horária: turnos incompatíveis');
    }
  } else {
    motivos.push('Carga horária: não avaliada');
  }

  score = Math.min(Math.max(score, 0), 1);
  return { score: Number(score.toFixed(3)), motivos };
}

/**
 * Normaliza disponibilidade para turnos canônicos.
 */
function normalizarDisponibilidade(disp) {
  if (!disp) return [];
  const out = new Set();
  for (const d of disp) {
    const norm = normalizar(d);
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
 * GET /api/vagas/:id/recomendar
 * Top N profissionais recomendados para uma vaga (score por cidade + carga horária).
 */
export async function recomendarParaVaga(idVaga, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 10, 50);
  const minScore = Number(opts.minScore) || 0.3;

  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [idVaga]);
  if (!vaga) return null;

  const profissionais = await db.all(
    `SELECT u.id, u.nome, u.criado_em,
            d.id_user, d.diploma_url, d.diploma_verificado,
            d.registro_conselho, d.tipo_registro, d.registro_verificado,
            d.especialidades, d.disponibilidade, d.bio, d.cidade,
            (SELECT COALESCE(ROUND(AVG(nota), 2), 0) FROM avaliacoes WHERE id_profissional = u.id) AS media,
            (SELECT COUNT(*) FROM avaliacoes WHERE id_profissional = u.id) AS total_avaliacoes
       FROM users u
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE u.tipo_usuario = 'profissional'
        AND u.suspended_at IS NULL`
  );

  const candidatos = await db.all(
    'SELECT id_profissional FROM candidaturas WHERE id_vaga = ?',
    [idVaga]
  );
  const jaCandidatados = new Set(candidatos.map(c => c.id_profissional));

  const recomendacoes = [];
  for (const p of profissionais) {
    if (jaCandidatados.has(p.id)) continue;
    try { p.especialidades = JSON.parse(p.especialidades || '[]'); } catch { p.especialidades = []; }
    try { p.disponibilidade = JSON.parse(p.disponibilidade || '[]'); } catch { p.disponibilidade = []; }

    const { score, motivos } = calcularScore(vaga, { detalhes: p });

    if (score >= minScore) {
      recomendacoes.push({
        profissional: {
          id: p.id, nome: p.nome,
          registro_conselho: p.registro_conselho, tipo_registro: p.tipo_registro,
          registro_verificado: p.registro_verificado, diploma_verificado: p.diploma_verificado,
          especialidades: p.especialidades, disponibilidade: p.disponibilidade,
          bio: p.bio, cidade: p.cidade,
          media_avaliacao: p.media || 0, total_avaliacoes: p.total_avaliacoes || 0
        },
        score, motivos
      });
    }
  }

  recomendacoes.sort((a, b) => b.score - a.score);
  return { vaga_id: idVaga, total: recomendacoes.length, recomendacoes: recomendacoes.slice(0, limite) };
}

/**
 * GET /api/profissionais/me/recomendar
 * Top N vagas recomendadas para um profissional (score por cidade + carga horária).
 */
export async function recomendarParaProfissional(idProf, opts = {}) {
  const limite = Math.min(Number(opts.limite) || 10, 50);
  const minScore = Number(opts.minScore) || 0.3;

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

  const profissional = { detalhes: prof, stats: { media: stats?.media || 0, total: stats?.total || 0 } };

  const vagas = await db.all(
    `SELECT v.* FROM vagas v
      WHERE v.status = 'ativa'
        AND v.id NOT IN (SELECT id_vaga FROM candidaturas WHERE id_profissional = ?)
      ORDER BY v.criado_em DESC LIMIT 200`,
    [idProf]
  );

  const recomendacoes = [];
  for (const vaga of vagas) {
    const { score, motivos } = calcularScore(vaga, profissional);
    if (score >= minScore) {
      recomendacoes.push({
        vaga: {
          id: vaga.id, profissional_desejado: vaga.profissional_desejado,
          complexidade: vaga.complexidade, cidade: vaga.cidade,
          carga_horaria: vaga.carga_horaria, regiao: vaga.regiao,
          remuneracao_valor: vaga.remuneracao_valor, remuneracao_tipo: vaga.remuneracao_tipo,
          servico_descricao: vaga.servico_descricao, criado_em: vaga.criado_em
        },
        score, motivos
      });
    }
  }

  recomendacoes.sort((a, b) => b.score - a.score);
  return { profissional_id: idProf, total: recomendacoes.length, recomendacoes: recomendacoes.slice(0, limite) };
}
