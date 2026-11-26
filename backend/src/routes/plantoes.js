/**
 * routes/plantoes.js
 *
 * Plantões avulsos vendidos via Payment Link do Mercado Pago.
 *
 * Fluxo:
 *   1. GET /api/plantoes            → catálogo público (preço aparece)
 *   2. POST /api/plantoes/:id/checkout → registra intenção (pendente) e
 *      devolve a URL do checkout hospedado no MP, com external_reference
 *      preservada na query (chave de reconciliação)
 *   3. Usuário paga no MP; o webhook (services/mercadopago.js) casa o
 *      pagamento pelo external_reference e marca como 'pago'
 *   4. GET /api/plantoes/status/:ref → status de um pagamento (dono/admin)
 *      GET /api/plantoes/meus        → histórico do usuário logado
 *
 * Em modo mock (MERCADOPAGO_MOCK=true ou sem access token) existe o
 * POST /api/plantoes/status/:ref/confirmar para simular o pagamento —
 * em produção o endpoint devolve 403, a confirmação real vem do webhook.
 */
import express from 'express';
import { createRouter } from '../middleware/async.js';
import db from '../db/driver.js';
import { authRequired } from '../middleware/auth.js';
import { isMock } from '../services/mercadopago.js';
import {
  listarPlantoes,
  getPlantao,
  montarCheckoutUrl,
  novaExternalReference,
  FAMILIAS
} from '../services/mercadopago-links.js';

const router = createRouter(express);

/**
 * GET /api/plantoes            — catálogo completo (público)
 * GET /api/plantoes?familia=x  — filtro por família
 */
router.get('/', async (req, res) => {
  const { familia } = req.query;
  if (familia && !FAMILIAS.includes(familia)) {
    return res.status(400).json({
      error: `Família inválida: ${familia}`,
      familias_validas: FAMILIAS
    });
  }
  res.json({ plantoes: listarPlantoes(familia) });
});

router.get('/meus', authRequired, async (req, res) => {
  const rows = await db.all(
    `SELECT id, external_reference, id_plantao, titulo, valor_centavos,
            status, mp_payment_id, criado_em, pago_em
       FROM pagamentos_link
      WHERE id_user = ?
      ORDER BY criado_em DESC`,
    [req.user.id]
  );
  res.json({ pagamentos: rows });
});

router.get('/status/:ref', authRequired, async (req, res) => {
  const { ref } = req.params;
  const pag = await db.get('SELECT * FROM pagamentos_link WHERE external_reference = ?', [ref]);
  if (!pag) return res.status(404).json({ error: 'Pagamento não encontrado' });
  // Isolamento: só o dono (ou admin) vê o pagamento — evita varredura de refs.
  if (pag.id_user !== req.user.id && !req.user.is_admin) {
    return res.status(404).json({ error: 'Pagamento não encontrado' });
  }
  res.json({ pagamento: pag });
});

router.post('/:id/checkout', authRequired, async (req, res) => {
  const plantao = getPlantao(req.params.id);
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' });

  const ref = novaExternalReference(plantao.id);
  const linkId = (process.env[plantao.envKey] || '').trim() || plantao.demoLinkId;

  await db.run(
    `INSERT INTO pagamentos_link
       (external_reference, id_plantao, link_id, id_user, titulo, valor_centavos, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pendente')`,
    [ref, plantao.id, linkId, req.user.id, plantao.titulo, plantao.preco_centavos]
  );

  const checkout_url = montarCheckoutUrl(plantao, ref);
  res.status(201).json({
    checkout_url,
    external_reference: ref,
    pagamento: {
      id_plantao: plantao.id,
      titulo: plantao.titulo,
      valor_centavos: plantao.preco_centavos,
      status: 'pendente'
    }
  });
});

/**
 * POST /api/plantoes/status/:ref/confirmar
 * Simula a confirmação do pagamento — só existe em modo mock. É o passo que
 * o webhook faria no Mercado Pago real (marca 'pago' pelo external_reference).
 */
router.post('/status/:ref/confirmar', authRequired, async (req, res) => {
  if (!isMock) {
    return res.status(403).json({
      error: 'Confirmação manual só existe no modo mock (MERCADOPAGO_MOCK=true). Em produção a confirmação vem do webhook do Mercado Pago.'
    });
  }
  const { ref } = req.params;
  const pag = await db.get('SELECT * FROM pagamentos_link WHERE external_reference = ?', [ref]);
  if (!pag) return res.status(404).json({ error: 'Pagamento não encontrado' });
  if (pag.id_user !== req.user.id && !req.user.is_admin) {
    return res.status(404).json({ error: 'Pagamento não encontrado' });
  }
  if (pag.status === 'pago') {
    return res.json({ pagamento: pag });   // idempotente
  }
  await db.run(
    `UPDATE pagamentos_link SET status = 'pago', pago_em = datetime('now'), mp_payment_id = ?
      WHERE external_reference = ?`,
    [`mock_pay_${Date.now()}`, ref]
  );
  const updated = await db.get('SELECT * FROM pagamentos_link WHERE external_reference = ?', [ref]);
  res.json({ pagamento: updated });
});

export default router;
