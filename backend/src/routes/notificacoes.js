import express from 'express';
import { createRouter } from '../middleware/async.js';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = createRouter(express);

/**
 * GET /api/notificacoes
 * Retorna notificações agregadas (não lidas + recentes) para o usuário.
 *
 * Para PROFISSIONAL:
 *   - Candidaturas aceitas/recusadas recentes
 *   - Mensagens não lidas
 *
 * Para CONTRATANTE:
 *   - Novas candidaturas em suas vagas
 *   - Mensagens não lidas
 *
 * Inclui contadores de "não lidos" para badge no Navbar.
 */
router.get('/', authRequired, async (req, res) => {
  const userId = req.user.id;
  const tipo = req.user.tipo_usuario;

  const items = [];
  let naoLidas = 0;

  // 1) Mensagens não lidas
  const msgs = await db.all(
    `SELECT m.id, m.id_remetente, m.conteudo, m.criado_em, m.id_vaga,
            u.nome AS remetente_nome
       FROM mensagens m
       JOIN users u ON u.id = m.id_remetente
      WHERE m.id_destinatario = ? AND m.lida = 0
      ORDER BY m.criado_em DESC
      LIMIT 20`,
    [userId]
  );
  naoLidas += msgs.length;
  for (const m of msgs) {
    items.push({
      tipo: 'mensagem',
      id: m.id,
      titulo: `Mensagem de ${m.remetente_nome}`,
      preview: m.conteudo.length > 80 ? m.conteudo.slice(0, 80) + '...' : m.conteudo,
      de: m.id_remetente,
      vaga_id: m.id_vaga,
      criado_em: m.criado_em
    });
  }

  if (tipo === 'contratante') {
    // 2) Novas candidaturas (pendentes) nas vagas do contratante
    const cands = await db.all(
      `SELECT c.id, c.id_profissional, c.criado_em, c.status_candidatura,
              v.id AS vaga_id, v.profissional_desejado,
              u.nome AS profissional_nome
         FROM candidaturas c
         JOIN vagas v ON v.id = c.id_vaga
         JOIN users u ON u.id = c.id_profissional
        WHERE v.id_contratante = ? AND c.status_candidatura IN ('pendente', 'visualizada')
        ORDER BY c.criado_em DESC
        LIMIT 20`,
      [userId]
    );
    naoLidas += cands.length;
    for (const c of cands) {
      items.push({
        tipo: 'candidatura',
        id: c.id,
        titulo: `Nova candidatura: ${c.profissional_nome}`,
        preview: `Candidatou-se para ${c.profissional_desejado}`,
        vaga_id: c.vaga_id,
        criado_em: c.criado_em
      });
    }
  } else {
    // 3) Profissional: respostas de candidaturas
    const cands = await db.all(
      `SELECT c.id, c.id_vaga, c.status_candidatura, c.criado_em,
              v.profissional_desejado, u.nome AS contratante_nome
         FROM candidaturas c
         JOIN vagas v ON v.id = c.id_vaga
         JOIN users u ON u.id = v.id_contratante
        WHERE c.id_profissional = ?
          AND c.status_candidatura IN ('aceita', 'recusada')
          AND c.atualizada_em > datetime('now', '-30 day')
        ORDER BY c.criado_em DESC
        LIMIT 20`,
      [userId]
    );
    for (const c of cands) {
      const isAceita = c.status_candidatura === 'aceita';
      items.push({
        tipo: 'resposta_candidatura',
        id: c.id,
        titulo: isAceita ? '✓ Candidatura aceita!' : 'Candidatura recusada',
        preview: `${c.contratante_nome} - ${c.profissional_desejado}`,
        vaga_id: c.id_vaga,
        criado_em: c.criado_em
      });
    }
  }

  // Ordena por data (mais recente primeiro)
  items.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));

  res.json({
    nao_lidas: naoLidas,
    items: items.slice(0, 20)
  });
});

/**
 * POST /api/notificacoes/marcar-lidas
 * Marca todas as mensagens do usuário como lidas.
 */
router.post('/marcar-lidas', authRequired, async (req, res) => {
  await db.run(
    `UPDATE mensagens SET lida = 1
      WHERE id_destinatario = ? AND lida = 0`,
    [req.user.id]
  );
  res.json({ ok: true });
});

/**
 * GET /api/notificacoes/contador
 * Apenas o número de não lidas (usado para polling leve no badge).
 */
router.get('/contador', authRequired, async (req, res) => {
  const userId = req.user.id;
  const tipo = req.user.tipo_usuario;

  const msgsRow = await db.get(
    'SELECT COUNT(*) AS n FROM mensagens WHERE id_destinatario = ? AND lida = 0',
    [userId]
  );
  const msgsNaoLidas = msgsRow?.n || 0;

  let candNaoLidas = 0;
  if (tipo === 'contratante') {
    const row = await db.get(
      `SELECT COUNT(*) AS n
         FROM candidaturas c
         JOIN vagas v ON v.id = c.id_vaga
        WHERE v.id_contratante = ? AND c.status_candidatura IN ('pendente', 'visualizada')`,
      [userId]
    );
    candNaoLidas = row?.n || 0;
  }

  res.json({ nao_lidas: msgsNaoLidas + candNaoLidas });
});

export default router;