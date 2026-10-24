import express from 'express';
import db from '../db/driver.js';
import { authRequired, requireTipo } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyNetlify } from '../services/netlify.js';
import {
  logarTransicaoCandidatura,
  notificarCandidaturaVisualizada,
  notificarCandidaturaStatus
} from '../services/event-bus.js';

const router = express.Router();

const candidaturaSchema = {
  id_vaga:  { required: true, type: 'integer', min: 1 },
  mensagem: { type: 'string', max: 1000 }
};

router.post('/', authRequired, requireTipo('profissional'),
  validateBody(candidaturaSchema), async (req, res) => {
    const { id_vaga, mensagem } = req.body;
    const vaga = await db.get("SELECT * FROM vagas WHERE id = ? AND status = 'ativa'", [id_vaga]);
    if (!vaga) return res.status(404).json({ error: 'Vaga não disponível' });

    // M8 — Limite de candidaturas por vaga (env MAX_CANDIDATURAS_PER_VAGA, default 50)
    const MAX_CANDIDATURAS = Number(process.env.MAX_CANDIDATURAS_PER_VAGA || 50);
    const contagem = await db.get(
      'SELECT COUNT(*) AS n FROM candidaturas WHERE id_vaga = ?',
      [id_vaga]
    );
    if (contagem && contagem.n >= MAX_CANDIDATURAS) {
      return res.status(429).json({
        error: 'Vaga atingiu o limite máximo de candidaturas',
        limite: MAX_CANDIDATURAS,
        atual: contagem.n,
        motivo: 'Aguarde o contratante processar as candidaturas existentes.'
      });
    }

    try {
      const info = await db.run(
        `INSERT INTO candidaturas (id_vaga, id_profissional, mensagem)
         VALUES (?, ?, ?)`,
        [id_vaga, req.user.id, mensagem || null]
      );
      const cand = await db.get('SELECT * FROM candidaturas WHERE id = ?', [info.lastInsertRowid]);

      // M11 — Registra criação da candidatura (de null → pendente)
      await logarTransicaoCandidatura(cand.id, null, 'pendente', req.user.id, 'candidatura criada');

      notifyNetlify('candidatura_enviada', {
        candidatura_id: cand.id, vaga_id: id_vaga, profissional_id: req.user.id
      }).catch(e => console.warn('[webhook]', e.message));
      res.status(201).json({ candidatura: cand });
    } catch (err) {
      if (String(err.message).includes('UNIQUE') || String(err.code).includes('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
      }
      if (String(err.code) === '23505') {
        return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
      }
      throw err;
    }
  }
);

router.get('/profissional/minhas', authRequired, requireTipo('profissional'), async (req, res) => {
  const rows = await db.all(
    `SELECT c.*, v.profissional_desejado, v.complexidade, v.regiao, v.remuneracao_valor,
            v.remuneracao_tipo, v.status AS vaga_status, v.servico_descricao,
            v.id_contratante, u.nome AS contratante_nome
       FROM candidaturas c
       JOIN vagas v ON v.id = c.id_vaga
       JOIN users u ON u.id = v.id_contratante
      WHERE c.id_profissional = ?
      ORDER BY c.criado_em DESC`,
    [req.user.id]
  );
  res.json({ candidaturas: rows });
});

router.get('/vaga/:id', authRequired, requireTipo('contratante'), async (req, res) => {
  const id = Number(req.params.id);
  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [id]);
  if (!vaga) return res.status(404).json({ error: 'Vaga não encontrada' });
  if (vaga.id_contratante !== req.user.id) {
    return res.status(403).json({ error: 'Você não é dono desta vaga' });
  }

  // W4 — Antes de marcar como visualizada, busca quais candidaturas estão pendentes
  // para que possamos notificar esses profissionais em tempo real.
  const pendentes = await db.all(
    `SELECT c.id AS candidatura_id, c.id_profissional AS profissional_id
       FROM candidaturas c
      WHERE c.id_vaga = ? AND c.status_candidatura = 'pendente'`,
    [id]
  );

  await db.run(
    `UPDATE candidaturas SET status_candidatura = 'visualizada'
      WHERE id_vaga = ? AND status_candidatura = 'pendente'`,
    [id]
  );

  // M11 + W4 — Registra auditoria + notifica cada profissional
  for (const p of pendentes) {
    await logarTransicaoCandidatura(p.candidatura_id, 'pendente', 'visualizada', req.user.id, 'visualizada pelo contratante');
    notificarCandidaturaVisualizada({
      candidatura_id: p.candidatura_id,
      vaga_id: id,
      profissional_id: p.profissional_id,
      contratante_id: req.user.id
    }).catch(e => console.warn('[event-bus]', e.message));
  }

  const rows = await db.all(
    `SELECT c.id, c.mensagem, c.status_candidatura, c.criado_em,
            u.id AS profissional_id, u.nome AS profissional_nome, u.email AS profissional_email,
            u.telefone AS profissional_telefone,
            d.registro_conselho, d.tipo_registro, d.diploma_verificado,
            d.registro_verificado, d.especialidades, d.disponibilidade, d.bio
       FROM candidaturas c
       JOIN users u ON u.id = c.id_profissional
       LEFT JOIN profissionais_detalhes d ON d.id_user = u.id
      WHERE c.id_vaga = ?
      ORDER BY c.criado_em DESC`,
    [id]
  );
  for (const r of rows) {
    try { r.especialidades = JSON.parse(r.especialidades || '[]'); } catch { r.especialidades = []; }
    try { r.disponibilidade = JSON.parse(r.disponibilidade || '[]'); } catch { r.disponibilidade = []; }
  }
  res.json({ candidatos: rows });
});

router.patch('/:id', authRequired, requireTipo('contratante'),
  validateBody({
    status_candidatura: { required: true, type: 'enum', values: ['aceita', 'recusada'] }
  }),
  async (req, res) => {
    const id = Number(req.params.id);
    const cand = await db.get(
      `SELECT c.*, v.id_contratante FROM candidaturas c
       JOIN vagas v ON v.id = c.id_vaga
       WHERE c.id = ?`,
      [id]
    );
    if (!cand) return res.status(404).json({ error: 'Candidatura não encontrada' });
    if (cand.id_contratante !== req.user.id) {
      return res.status(403).json({ error: 'Você não é dono desta vaga' });
    }

    const statusAnterior = cand.status_candidatura;
    await db.run('UPDATE candidaturas SET status_candidatura = ? WHERE id = ?', [req.body.status_candidatura, id]);

    // M11 — Registra auditoria da transição
    await logarTransicaoCandidatura(id, statusAnterior, req.body.status_candidatura, req.user.id);

    // W4 — Notifica o profissional em tempo real via Socket.IO + Web Push
    notificarCandidaturaStatus({
      candidatura_id: id,
      vaga_id: cand.id_vaga,
      profissional_id: cand.id_profissional,
      contratante_id: req.user.id,
      status: req.body.status_candidatura,
      motivo: null
    }).catch(e => console.warn('[event-bus]', e.message));

    // M7 + W5 — Auto-close vaga após primeiro aceite + notifica interessados
    if (req.body.status_candidatura === 'aceita' && process.env.AUTO_CLOSE_ON_ACCEPT !== 'false') {
      const vagaAtual = await db.get('SELECT id, status, id_contratante, remuneracao_valor, remuneracao_tipo FROM vagas WHERE id = ?', [cand.id_vaga]);
      const statusAnteriorVaga = vagaAtual?.status;
      await db.run("UPDATE vagas SET status = 'fechada' WHERE id = ? AND status = 'ativa'", [cand.id_vaga]);
      // Só emite W5 se a vaga estava realmente ativa (foi fechada agora)
      if (statusAnteriorVaga === 'ativa') {
        const { notificarVagaStatus } = await import('../services/event-bus.js');
        notificarVagaStatus({
          vaga_id: cand.id_vaga,
          status_anterior: 'ativa',
          status_novo: 'fechada',
          contratante_id: req.user.id
        }).catch(e => console.warn('[event-bus]', e.message));
      }

      // ─── Sistema de Protocolos de Pagamento (Feature: Protocolos) ───
      // Cria PCP (Protocolo de Custódia de Plantão) + envia PCM ao profissional.
      // PCP → PCM → PDC (pagamento) → checkout → liberação (72h).
      if (process.env.PROTOCOLOS_ENABLED !== 'false' && vagaAtual?.remuneracao_valor) {
        try {
          const { criarPCP } = await import('../services/protocolos.js');
          const { pcp, pcm } = await criarPCP({
            candidatura_id: id,
            vaga_id: cand.id_vaga,
            contratante_id: req.user.id,
            profissional_id: cand.id_profissional,
            remuneracao_valor_reais: vagaAtual.remuneracao_valor,
            remuneracao_tipo: vagaAtual.remuneracao_tipo
          });
          console.log(`[protocolos] PCP #${pcp.id} + PCM #${pcm.id} criados para vaga ${cand.id_vaga}`);
        } catch (err) {
          console.warn('[protocolos] falha ao criar PCP/PCM:', err.message);
          // Não bloqueia o aceite da candidatura se protocolos falhar
        }
      }
    }

    const updated = await db.get('SELECT * FROM candidaturas WHERE id = ?', [id]);
    notifyNetlify(`candidatura_${req.body.status_candidatura}`, {
      candidatura_id: id, vaga_id: cand.id_vaga, profissional_id: cand.id_profissional
    }).catch(e => console.warn('[webhook]', e.message));
    res.json({ candidatura: updated });
  }
);

/**
 * GET /api/candidaturas/:id/historico-status
 * M11 — Retorna o histórico de transições de status de uma candidatura.
 */
router.get('/:id/historico-status', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  // Verifica que o user tem acesso à candidatura (é o profissional OU é o contratante da vaga)
  const cand = await db.get(
    `SELECT c.id_profissional, v.id_contratante
       FROM candidaturas c
       JOIN vagas v ON v.id = c.id_vaga
      WHERE c.id = ?`,
    [id]
  );
  if (!cand) return res.status(404).json({ error: 'Candidatura não encontrada' });
  if (cand.id_profissional !== req.user.id && cand.id_contratante !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const rows = await db.all(
    `SELECT l.*, u.nome AS alterado_por_nome
       FROM candidatura_status_log l
       JOIN users u ON u.id = l.alterado_por
      WHERE l.id_candidatura = ?
      ORDER BY l.criado_em ASC`,
    [id]
  );
  res.json({ historico: rows });
});

/**
 * GET /api/candidaturas/contratante/historico
 * Lista todas as vagas FECHADAS do contratante + profissional vencedor.
 */
router.get('/contratante/historico', authRequired, requireTipo('contratante'), async (req, res) => {
  const rows = await db.all(
    `SELECT v.id AS vaga_id, v.profissional_desejado, v.complexidade, v.regiao,
            v.remuneracao_valor, v.remuneracao_tipo, v.criado_em, v.status,
            u.id AS profissional_id, u.nome AS profissional_nome, u.telefone AS profissional_telefone,
            c.id AS candidatura_id, c.criado_em AS candidatura_em
       FROM vagas v
       JOIN candidaturas c ON c.id_vaga = v.id AND c.status_candidatura = 'aceita'
       JOIN users u ON u.id = c.id_profissional
      WHERE v.id_contratante = ? AND v.status = 'fechada'
      ORDER BY v.criado_em DESC`,
    [req.user.id]
  );

  // Adiciona info de avaliação (se houver)
  for (const r of rows) {
    const av = await db.get(
      `SELECT nota, comentario, criado_em FROM avaliacoes
        WHERE id_contratante = ? AND id_profissional = ? AND id_vaga = ?`,
      [req.user.id, r.profissional_id, r.vaga_id]
    );
    r.avaliacao = av || null;
  }
  res.json({ historico: rows });
});

export default router;
