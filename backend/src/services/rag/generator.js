/**
 * RAG — Geração de resposta.
 *
 * Dois modos:
 *   1. Com LLM  → se OPENAI_API_KEY ou ANTHROPIC_API_KEY estiver setado,
 *                  envia o contexto recuperado e devolve a resposta do modelo.
 *   2. Sem LLM  → resposta EXTRATIVA: monta a resposta a partir dos chunks
 *                  recuperados. Não é tan natural quanto um LLM, mas funciona
 *                  100% offline e sem custo — ideal para demo e dev.
 */
import { montarContexto } from './retriever.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_MODEL = process.env.RAG_LLM_MODEL || 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.RAG_LLM_MODEL_ANTHROPIC || 'claude-3-5-sonnet-latest';

export function llmDisponivel() {
  return !!(OPENAI_KEY || ANTHROPIC_KEY);
}

export function provedorLlm() {
  if (ANTHROPIC_KEY) return 'anthropic';
  if (OPENAI_KEY) return 'openai';
  return null;
}

const SYSTEM_PROMPT = `Você é o assistente da Essência do Cuidar, um marketplace de profissionais de saúde
para atendimento domiciliar de idosos e pacientes de baixa e média complexidade.

Responda SEMPRE em português do Brasil, com tom profissional, empático e objetivo.
Baseie-se EXCLUSIVAMENTE no contexto fornecido. Se a resposta não estiver no contexto, diga
honestamente que não encontrou a informação e sugira como obtê-la.
Cite as fontes no formato [1], [2] quando usar informação de um trecho específico.
Não invente vagas, profissionais, valores, prazos ou regras que não estejam no contexto.`;

export async function gerarResposta(pergunta, chunks) {
  if (!chunks.length) {
    return {
      resposta:
        'Não encontrei nada no índice de knowledge da plataforma sobre isso. ' +
        'Tente reformular a pergunta ou contate o suporte.',
      modo: 'sem-contexto',
      fontes: []
    };
  }

  const contexto = montarContexto(chunks);

  if (ANTHROPIC_KEY) {
    try {
      return await gerarAnthropic(pergunta, contexto, chunks);
    } catch (err) {
      console.warn('[rag] Anthropic falhou, caindo no fallback:', err.message?.slice(0, 100));
    }
  }
  if (OPENAI_KEY) {
    try {
      return await gerarOpenAI(pergunta, contexto, chunks);
    } catch (err) {
      console.warn('[rag] OpenAI falhou, caindo no fallback:', err.message?.slice(0, 100));
    }
  }
  return gerarExtrativa(pergunta, chunks);
}

async function gerarAnthropic(pergunta, contexto, chunks) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Contexto:\n\n${contexto}\n\nPergunta: ${pergunta}` }]
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const texto = (data.content || []).map((c) => c.text || '').join('').trim();
  return { resposta: texto, modo: 'anthropic', fontes: fontesDe(chunks) };
}

async function gerarOpenAI(pergunta, contexto, chunks) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Contexto:\n\n${contexto}\n\nPergunta: ${pergunta}` }
      ]
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const texto = data.choices?.[0]?.message?.content?.trim() || '';
  return { resposta: texto, modo: 'openai', fontes: fontesDe(chunks) };
}

/**
 * Resposta extrativa: sem LLM, monta a resposta com os trechos mais
 * relevantes. Prioriza chunks de vaga/profissional (dados concretos) e
 * formata como uma lista de achados com a fonte.
 */
function gerarExtrativa(pergunta, chunks) {
  const dados = chunks.filter((c) => c.tipo === 'vaga' || c.tipo === 'profissional');
  const conhecimento = chunks.filter((c) => c.tipo === 'conhecimento');
  const linhas = [];

  linhas.push(
    `Com base no índice da Essência do Cuidar, encontrei ${chunks.length} trecho(s) relacionado a "${pergunta}":`
  );

  if (dados.length) {
    linhas.push('');
    linhas.push('**Resultados encontrados:**');
    dados.slice(0, 4).forEach((c, i) => {
      const linhasConteudo = c.conteudo.split('\n').filter(Boolean);
      linhas.push('');
      linhas.push(`${i + 1}. **${c.titulo}**`);
      linhasConteudo.slice(0, 5).forEach((l) => linhas.push(`   - ${l}`));
    });
  }

  if (conhecimento.length) {
    linhas.push('');
    linhas.push('**Informações da plataforma:**');
    conhecimento.slice(0, 2).forEach((c) => {
      linhas.push('');
      linhas.push(`- ${c.conteudo.split('\n')[0]}`);
    });
  }

  linhas.push('');
  linhas.push(
    dados.length
      ? '_(Resposta extrativa — configure OPENAI_API_KEY ou ANTHROPIC_API_KEY para geração em linguagem natural.)_'
      : '_(Resposta extrativa — configure uma LLM para uma resposta mais fluida.)_'
  );

  return { resposta: linhas.join('\n'), modo: 'extrativa', fontes: fontesDe(chunks) };
}

function fontesDe(chunks) {
  return chunks.map((c, i) => ({
    n: i + 1,
    tipo: c.tipo,
    titulo: c.titulo,
    fonte: c.fonte,
    ref_id: c.ref_id,
    score: c.score,
    trecho: c.conteudo.slice(0, 280)
  }));
}
