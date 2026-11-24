/**
 * RAG — rotas da API.
 *
 *   GET  /api/rag/status      → estado do índice (sem auth)
 *   POST /api/rag/consultar   → pergunta → resposta + fontes (sem auth, com rate limit)
 *   POST /api/rag/indexar     → reindexa (admin only)
 *   GET  /api/rag/documentos  → lista os documentos indexados (admin only)
 */
import express from 'express';
import { createRouter } from '../middleware/async.js';
import db from '../db/driver.js';
import { authRequired, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { buscar } from '../services/rag/retriever.js';
import { gerarResposta, llmDisponivel, provedorLlm } from '../services/rag/generator.js';
import { reindexar } from '../services/rag/indexer.js';
import { embeddingInfo, initEmbeddings } from '../services/rag/embeddings.js';

const router = createRouter(express);

router.get('/status', async (req, res) => {
  // Garante que o modelo de embeddings esteja carregado para reportar
  // o estado real (e evitar mismatch de dimensão em consultas futuras).
  await initEmbeddings().catch(() => {});
  const [docs, chunks] = await Promise.all([
    db.get('SELECT COUNT(*) AS n FROM rag_documentos'),
    db.get('SELECT COUNT(*) AS n FROM rag_chunks')
  ]);
  const porTipo = await db.all('SELECT tipo, COUNT(*) AS n FROM rag_documentos GROUP BY tipo');
  res.json({
    indexado: (chunks?.n || 0) > 0,
    documentos: docs?.n || 0,
    chunks: chunks?.n || 0,
    por_tipo: Object.fromEntries(porTipo.map((r) => [r.tipo, r.n])),
    embeddings: embeddingInfo(),
    llm: { disponivel: llmDisponivel(), provedor: provedorLlm() }
  });
});

router.post('/consultar', validateBody({
  pergunta: { required: true, type: 'string', min: 3, max: 500 },
  top_k:    { type: 'integer', min: 1, max: 20 },
  tipo:     { type: 'enum', values: ['vaga', 'profissional', 'conhecimento'] }
}), async (req, res) => {
  const { pergunta, top_k, tipo } = req.body;
  const topK = top_k || 5;

  const retrieval = await buscar(pergunta, { topK, tipo: tipo || null });
  const geracao = await gerarResposta(pergunta, retrieval.chunks);

  res.json({
    pergunta,
    resposta: geracao.resposta,
    modo: geracao.modo,
    fontes: geracao.fontes,
    embeddings: retrieval.embeddings
  });
});

router.post('/indexar', authRequired, requireAdmin, async (req, res) => {
  const stats = await reindexar();
  res.json({ ok: true, ...stats });
});

router.get('/documentos', authRequired, requireAdmin, async (req, res) => {
  const { tipo, limite = 100, offset = 0 } = req.query;
  const rows = await db.all(
    `SELECT doc_key AS doc_id, tipo, titulo, origem AS fonte, ref_id, criado_em,
            (SELECT COUNT(*) FROM rag_chunks c WHERE c.id_documento = d.id) AS chunks
       FROM rag_documentos d
      ${tipo ? 'WHERE tipo = ?' : ''}
      ORDER BY tipo, titulo
      LIMIT ? OFFSET ?`,
    [...(tipo ? [tipo] : []), Math.min(Number(limite) || 100, 500), Number(offset) || 0]
  );
  res.json({ documentos: rows });
});

export default router;
