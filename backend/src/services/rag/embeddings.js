/**
 * RAG — Retrieval-Augmented Generation.
 *
 * Pipeline:
 *   1. INDEXAÇÃO  → documentos (vagas, profissionais, base de conhecimento)
 *                   viram chunks → embeddings → salvos em rag_chunks
 *   2. RETRIEVAL  → busca híbrida: similaridade vetorial (coseno) + BM25
 *   3. GERAÇÃO    → LLM (se OPENAI/ANTHROPIC_API_KEY houver) ou resposta
 *                   extrativa sem LLM (fallback que sempre funciona)
 *
 * Embeddings: transformers.js local (multilingual-e5-small, 384 dims) —
 * sem API key, roda offline depois do primeiro download. Fallback
 * determinístico (hash de n-gramas) se o modelo não estiver disponível.
 */
import { cosineSimilarity } from './similarity.js';

const MODEL_ID = process.env.RAG_MODEL || 'Xenova/multilingual-e5-small';
const DIM = Number(process.env.RAG_DIM || 384);
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 700);
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);
const TOP_K_DEFAULT = Number(process.env.RAG_TOP_K || 5);

let extractorPromise = null;
let embeddingsAvailable = false;
let modelId = null;

/**
 * Inicializa o pipeline de embeddings (lazy — carrega na 1ª indexação).
 * Se falhar (sem rede, modelo ausente), cai no fallback determinístico.
 */
export async function initEmbeddings() {
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    try {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false;
      const extractor = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
      embeddingsAvailable = true;
      modelId = MODEL_ID;
      console.log(`[rag] embeddings prontos (${MODEL_ID}, ${DIM} dims)`);
      return extractor;
    } catch (err) {
      embeddingsAvailable = false;
      modelId = 'fallback-hash-ngram';
      console.warn(`[rag] modelo indisponível (${err.message?.slice(0, 80)}). Usando embedding de fallback.`);
      return null;
    }
  })();

  return extractorPromise;
}

export function embeddingInfo() {
  return { disponivel: embeddingsAvailable, modelo: modelId, dim: embeddingsAvailable ? DIM : 256 };
}

/**
 * Gera embedding de um texto.
 * Usa e5 (prefixo "query: " / "passage: ") quando o modelo real está ativo.
 */
export async function embed(text, kind = 'passage') {
  const extractor = await initEmbeddings();
  const input = extractor ? `${kind === 'query' ? 'query' : 'passage'}: ${text}` : text;

  if (extractor) {
    try {
      const out = await extractor([input], { pooling: 'mean', normalize: true });
      const data = out.data;
      return Array.from(data);
    } catch (err) {
      console.warn('[rag] falha ao gerar embedding, usando fallback:', err.message?.slice(0, 60));
    }
  }
  return fallbackEmbedding(input, embeddingsAvailable ? DIM : 256);
}

/** Gera embeddings para vários textos em lote. */
export async function embedMany(texts, kind = 'passage') {
  const extractor = await initEmbeddings();
  if (extractor && texts.length) {
    try {
      const inputs = texts.map((t) => `${kind === 'query' ? 'query' : 'passage'}: ${t}`);
      const out = await extractor(inputs, { pooling: 'mean', normalize: true });
      const dim = out.dims[out.dims.length - 1];
      const flat = Array.from(out.data);
      const result = [];
      for (let i = 0; i < texts.length; i++) {
        result.push(flat.slice(i * dim, (i + 1) * dim));
      }
      return result;
    } catch (err) {
      console.warn('[rag] falha no batch, usando fallback:', err.message?.slice(0, 60));
    }
  }
  const dim = embeddingsAvailable ? DIM : 256;
  return texts.map((t) => fallbackEmbedding(t, dim));
}

/**
 * Embedding determinístico de fallback: hash de n-gramas de caracteres
 * ponderado por IDF. Não é semântico como um transformer, mas captura
 * similaridade lexical (e é sempre disponível, sem download).
 */
function fallbackEmbedding(text, dim) {
  const vec = new Array(dim).fill(0);
  const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);

  // n-gramas de palavra (1 e 2) + trigramas de caractere
  const grams = [];
  for (const t of tokens) grams.push(t);
  for (let i = 0; i < tokens.length - 1; i++) grams.push(`${tokens[i]}_${tokens[i + 1]}`);
  const clean = norm.replace(/\s+/g, ' ');
  for (let i = 0; i < clean.length - 2; i++) grams.push(clean.slice(i, i + 3));

  for (const g of grams) {
    const h = hash32(g);
    const idx = h % dim;
    const sign = (h >>> 31) & 1 ? 1 : -1;
    vec[idx] += sign * (g.includes('_') ? 1.6 : 1);
  }
  return normalize(vec);
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalize(vec) {
  const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / n);
}

/**
 * Divide um texto em chunks sobrepostos por parágrafo/sentença.
 */
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || !text.trim()) return [];
  const clean = text.trim();

  if (clean.length <= size) return [clean];

  // Quebra em parágrafos, depois agrupa até o limite
  const paragraphs = clean.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    if (current.length + p.length + 2 <= size) {
      current = current ? `${current}\n\n${p}` : p;
      continue;
    }
    if (current) chunks.push(current);

    if (p.length <= size) {
      current = p;
    } else {
      // Parágrafo grande → quebra por sentenças
      const sentences = p.match(/[^.!?]+[.!?]+/g) || [p];
      current = '';
      for (const s of sentences) {
        if (current.length + s.length > size) {
          if (current) chunks.push(current);
          // mantém sobreposição do fim do chunk anterior
          current = current.slice(-overlap) + s;
        } else {
          current += s;
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.map((c) => c.trim()).filter(Boolean);
}

export { cosineSimilarity, TOP_K_DEFAULT, CHUNK_SIZE, CHUNK_OVERLAP };
