/**
 * Assistente RAG — busca semântica sobre vagas, profissionais e as regras
 * da plataforma. Mostra a resposta com as fontes usadas.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

interface Fonte {
  n: number;
  tipo: string;
  titulo: string;
  fonte: string;
  ref_id: number | null;
  score: number;
  trecho: string;
}

interface Resposta {
  pergunta: string;
  resposta: string;
  modo: string;
  fontes: Fonte[];
}

const EXEMPLOS = [
  'Tem vagas para cuidador noturno?',
  'Quem tem experiência com Alzheimer?',
  'A plataforma aceita vaga de UTI?',
  'Como recebo pagamento pelo meu trabalho?',
  'Qual o formato do registro do COREN?'
];

const ICONE_TIPO: Record<string, string> = {
  vaga: '📋',
  profissional: '🩺',
  conhecimento: '📚'
};

export default function AssistenteRag() {
  const { t } = useTranslation();
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [historico, setHistorico] = useState<{ q: string; a: Resposta }[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/rag/status').then(({ data }) => setStatus(data)).catch(() => {});
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historico, carregando]);

  async function consultar(q: string) {
    const pergunta = q.trim();
    if (!pergunta || carregando) return;
    setErro('');
    setCarregando(true);
    setPergunta(q);
    try {
      const { data } = await api.post('/rag/consultar', { pergunta, top_k: 5 });
      setResposta(data);
      setHistorico((h) => [...h, { q: pergunta, a: data }]);
    } catch (e: any) {
      setErro(e?.response?.data?.error || 'Não foi possível consultar o assistente.');
    } finally {
      setCarregando(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    consultar(pergunta);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          🤖 Assistente Essência
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Pergunte sobre vagas, profissionais ou como a plataforma funciona.
          {status?.llm?.disponivel
            ? ' Respostas geradas por IA com base no índice da plataforma.'
            : ' Busca semântica sobre os dados da plataforma.'}
        </p>
        {status && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="badge-blue text-[10px]">
              {status.documentos} docs · {status.chunks} chunks
            </span>
            {status.embeddings?.disponivel && (
              <span className="badge-green text-[10px]">
                {status.embeddings.modelo} ({status.embeddings.dim}d)
              </span>
            )}
            <span className={`badge-${status.llm?.disponivel ? 'green' : 'amber'} text-[10px]`}>
              {status.llm?.disponivel ? `LLM: ${status.llm.provedor}` : 'modo extrativo'}
            </span>
          </div>
        )}
      </div>

      {/* Formulário */}
      <form onSubmit={onSubmit} className="card mb-6">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ex.: tem vagas para cuidador noturno em São Paulo?"
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            disabled={carregando}
          />
          <button type="submit" disabled={carregando || !pergunta.trim()} className="btn-primary px-5">
            {carregando ? '…' : 'Perguntar'}
          </button>
        </div>
        {!historico.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXEMPLOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => consultar(e)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-serenity-50 text-slate-600 hover:text-serenity-700 transition"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </form>

      {erro && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm mb-4">
          {erro}
        </div>
      )}

      {/* Histórico */}
      {historico.length === 0 && !carregando && (
        <div className="card text-center py-12 text-slate-500">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm">
            Faça uma pergunta acima. O assistente busca semanticamente em
            {' '}<strong>vagas ativas</strong>, <strong>perfis de profissionais</strong> e nas
            {' '}<strong>regras da plataforma</strong>.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {historico.map((item, i) => (
          <div key={i} className="space-y-2">
            {/* Pergunta */}
            <div className="flex justify-end">
              <div className="bg-serenity-500 text-white px-4 py-2 rounded-2xl max-w-[85%] text-sm">
                {item.q}
              </div>
            </div>

            {/* Resposta */}
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[95%] w-full shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-serenity-400 to-emerald-400 text-white flex items-center justify-center text-xs">🤖</span>
                  <span className="text-[11px] text-slate-500">
                    {item.a.modo === 'extrativa' ? 'resposta extrativa' : `IA (${item.a.modo})`}
                  </span>
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {item.a.resposta}
                </div>

                {/* Fontes */}
                {item.a.fontes?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">
                      Fontes ({item.a.fontes.length})
                    </p>
                    <div className="space-y-1.5">
                      {item.a.fontes.map((f) => (
                        <details key={f.n} className="group">
                          <summary className="cursor-pointer text-[11px] text-serenity-700 hover:underline flex items-center gap-1.5 list-none">
                            <span>{ICONE_TIPO[f.tipo] || '📄'}</span>
                            <span className="font-medium">[{f.n}] {f.titulo}</span>
                            <span className="text-slate-400 ml-auto">
                              score {f.score.toFixed(3)}
                            </span>
                          </summary>
                          <p className="text-[11px] text-slate-500 mt-1 pl-1 border-l-2 border-slate-100 whitespace-pre-wrap">
                            {f.trecho}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            origem: {f.fonte}
                            {f.ref_id ? ` · ref #${f.ref_id}` : ''}
                          </p>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {carregando && (
        <div className="flex justify-start">
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-serenity-400 to-emerald-400 text-white flex items-center justify-center text-xs">🤖</span>
              <span className="text-sm text-slate-400">buscando no índice…</span>
            </div>
          </div>
        </div>
      )}

      <div ref={fimRef} />
    </div>
  );
}
