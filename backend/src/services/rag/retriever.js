/**
 * RAG — Recuperação híbrida.
 *
 * Combina:
 *   - similaridade de cosseno entre embeddings (semântico)
 *   - BM25 sobre o texto dos chunks (lexical)
 *
 * A combinação é normalizada (rank fusion) para que uma das duasnão
 * domine a outra. O score final tambémconsidera um leve bônus para
 * documentos mais recentes (vagas ativas) e para o tipo de documento.
 */
import db from '../../db/driver.js';
import { embed, embeddingInfo } from './embeddings.js';
import { cosineSimilarity, BM25, tokenize } from './similarity.js';

const PESO_VETOR = 0.65;
const PESO_BM25 = 0.35;
const BONUS_VAGA_ATIVA = 0.08;
const BONUS_RECENTE = 0.04;

/**
 * Busca os chunks mais relevantes para uma pergunta.
 */
export async function buscar(pergunta, { topK = 5, tipo = null } = {}) {
  const rows = await db.all(
    `SELECT c.id, d.doc_key AS doc_id, c.ordem AS chunk_index, c.conteudo, c.embedding,
            d.tipo, d.titulo, d.origem AS fonte, d.ref_id
       FROM rag_chunks c
       JOIN rag_documentos d ON d.id = c.id_documento
      ${tipo ? 'WHERE d.tipo = ?' : ''}
      ORDER BY c.id`,
    tipo ? [tipo] : []
  );

  if (!rows.length) {
    return { chunks: [], total: 0, embeddings: embeddingInfo() };
  }

  // Score vetorial
  const qVec = await embed(pergunta, 'query');
  const scoresVet = rows.map((r) => {
    let v = [];
    try { v = JSON.parse(r.embedding); } catch {}
    // Dimensões diferentes (ex.: índice gravado com o modelo real mas
    // consulta com o fallback, ou vice-versa) → o cosseno não é comparável.
    if (!v.length || v.length !== qVec.length) return 0;
    return cosineSimilarity(qVec, v);
  });

  // Score lexical (BM25)
  const bm25 = new BM25(rows.map((r) => r.conteudo));
  const scoresBm = bm25.score(pergunta);

  // Normaliza BM25 para [0,1]
  const maxBm = Math.max(...scoresBm, 0);
  const scoresBmN = scoresBm.map((s) => (maxBm > 0 ? s / maxBm : 0));

  // Bônus
  const agora = Date.now();
  const scoresFinal = rows.map((r, i) => {
    let s = PESO_VETOR * scoresVet[i] + PESO_BM25 * scoresBmN[i];
    if (r.tipo === 'vaga' && /ativa/i.test(r.conteudo)) s += BONUS_VAGA_ATIVA;
    // vaga/profissional tem prioridade sobre conhecimento genérico
    if (r.tipo === 'vaga' || r.tipo === 'profissional') s += 0.02;
    return s;
  });

  const ordenados = rows
    .map((r, i) => ({ ...r, score: scoresFinal[i], score_vetor: scoresVet[i], score_bm25: scoresBmN[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => ({
      doc_id: r.doc_id,
      chunk_index: r.chunk_index,
      conteudo: r.conteudo,
      tipo: r.tipo,
      titulo: r.titulo,
      fonte: r.fonte,
      ref_id: r.ref_id,
      score: Number(r.score.toFixed(4)),
      score_vetor: Number(r.score_vetor.toFixed(4)),
      score_bm25: Number(r.score_bm25.toFixed(4))
    }));

  return {
    chunks: ordenados,
    total: rows.length,
    embeddings: embeddingInfo()
  };
}

/**
 * Formata os chunks recuperados como contexto para o prompt do LLM.
 */
export function montarContexto(chunks) {
  if (!chunks.length) return '';
  return chunks
    .map((c, i) => `[${i + 1}] (${c.tipo} — ${c.titulo})\n${c.conteudo}`)
    .join('\n\n---\n\n');
}
