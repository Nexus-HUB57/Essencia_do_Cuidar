/**
 * Similaridade e scoring para o RAG.
 */

/** Cosseno entre dois vetores (já normalizados ou não). */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * BM25 simplificado para scoring lexical de chunks.
 * docs: array de strings (texto já tokenizado opcionalmente)
 */
export class BM25 {
  constructor(docs, { k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map((d) => tokenize(d));
    this.N = this.docs.length || 1;
    this.avgLen = this.docs.reduce((s, d) => s + d.length, 0) / this.N || 1;
    this.tf = this.docs.map((d) => {
      const counts = new Map();
      for (const t of d) counts.set(t, (counts.get(t) || 0) + 1);
      return counts;
    });
    this.df = new Map();
    for (const tf of this.tf) {
      for (const term of tf.keys()) {
        this.df.set(term, (this.df.get(term) || 0) + 1);
      }
    }
  }

  idf(term) {
    const n = this.df.get(term) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  /** Scores[i] = score do doc i para a query. */
  score(query) {
    const q = tokenize(query);
    const scores = new Array(this.N).fill(0);
    for (const term of q) {
      const idf = this.idf(term);
      for (let i = 0; i < this.N; i++) {
        const f = this.tf[i].get(term);
        if (!f) continue;
        const len = this.docs[i].length;
        const denom = f + this.k1 * (1 - this.b + this.b * (len / this.avgLen));
        scores[i] += idf * ((f * (this.k1 + 1)) / denom);
      }
    }
    return scores;
  }
}

const STOPWORDS = new Set([
  'a','o','as','os','de','do','da','dos','e','em','para','com','um','uma','no','na','nos','nas',
  'por','que','qual','quais','como','onde','ao','aos','a','as','se','mais','menos','muito','eu',
  'voce','vc','ele','ela','nos','sobre','entre','ser','estar','tem','tem','sao','foi','sao',
  'the','of','and','to','in','for','with','is','are','what','how','where','which','me','my','i',
  'de','la','el','en','para','con','un','una','que','como','donde','es','son','mi','yo'
]);

/** Tokenização com normalização e remoção de stopwords. */
export function tokenize(text) {
  if (!text) return [];
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return norm
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
