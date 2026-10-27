import { useTranslation } from 'react-i18next';
import type { MatchingMotivo, MatchingNivel } from '../types';

/**
 * components/Recomendacoes.tsx
 *
 * Componentes visuais do sistema de matching automático.
 *
 * O backend devolve os motivos **estruturados** (`codigo` + `detalhe`) para
 * que este arquivo seja o único lugar onde a tradução acontece. O texto
 * exibido sai sempre de `matching.reasons.<codigo>`.
 */

const NIVEL_CLASSE: Record<MatchingNivel, string> = {
  alto: 'badge-green',
  medio: 'badge-amber',
  baixo: 'badge-slate'
};

/**
 * Converte o `detalhe` do backend nos parâmetros de interpolação do i18n.
 * `@param {MatchingMotivo} motivo`
 * @param {(k: string) => string} t
 * @returns {Record<string, string|number>}
 */
export function parametrosDoMotivo(motivo: MatchingMotivo, t: (k: string) => string) {
  const d = motivo.detalhe || {};
  const params: Record<string, string | number> = {};

  if (d.profissao) {
    params.profissao = t(`matching.profissoes.${d.profissao}`);
  }
  if (typeof d.turnos === 'number') params.turnos = d.turnos;
  if (typeof d.total === 'number') params.total = d.total;
  if (typeof d.media === 'number') params.media = d.media;
  if (typeof d.concluidas === 'number') params.concluidas = d.concluidas;
  if (d.especialidade) params.especialidade = d.especialidade;
  if (d.regiao) params.regiao = d.regiao;
  if (d.regiaoVaga) params.regiaoVaga = d.regiaoVaga;
  if (d.regiaoProf) params.regiaoProf = d.regiaoProf;

  return params;
}

/**
 * Traduz um motivo estruturado em texto legível.
 * @param {MatchingMotivo} motivo
 * @param {(k: string, o?: any) => string} t
 * @returns {string}
 */
export function textoDoMotivo(motivo: MatchingMotivo, t: (k: string, o?: any) => string) {
  const chave = `matching.reasons.${motivo.codigo}`;
  const params = parametrosDoMotivo(motivo, t as any);
  // i18next devolve a própria chave quando a tradução não existe — nesse caso
  // caímos no texto legível do backend.
  const texto = t(chave, params as any);
  return texto === chave ? motivo.codigo : texto;
}

/**
 * Selo circular com o score de compatibilidade (0–1 → 0–100%).
 * @param {number} score
 * @param {MatchingNivel} nivel
 */
export function SeloScore({ score, nivel }: { score: number; nivel: MatchingNivel }) {
  const pct = Math.round(score * 100);
  return (
    <div
      className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl shrink-0 ${
        nivel === 'alto'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : nivel === 'medio'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
      title={`${pct}%`}
    >
      <span className="text-base font-bold leading-none">{pct}%</span>
      <span className="text-[9px] uppercase tracking-wide opacity-70 mt-0.5">match</span>
    </div>
  );
}

/**
 * Lista de "chips" com os motivos do match.
 * @param {MatchingMotivo[]} motivos
 */
export function ListaMotivos({ motivos }: { motivos: MatchingMotivo[] }) {
  const { t } = useTranslation();
  // Só mostra motivos que realmente pontuaram (pontos > 0) ou que explicam
  // uma ausência de dados relevante. Motivos zerados não agregam ruído.
  const visiveis = motivos.filter((m) => m.pontos === null || m.pontos > 0);
  if (visiveis.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5 mt-2">
      {visiveis.map((m, i) => (
        <li
          key={`${m.codigo}-${i}`}
          className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600"
        >
          {textoDoMotivo(m, t as any)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Cabeçalho de uma seção de recomendações.
 * @param {string} titulo
 * @param {string} subtitulo
 * @param {number} total
 */
export function CabecalhoRecomendacoes({
  titulo,
  subtitulo,
  total
}: {
  titulo: string;
  subtitulo: string;
  total: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <span aria-hidden>✨</span> {titulo}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitulo}</p>
      </div>
      {total > 0 && (
        <span className="badge-blue shrink-0">
          {total} {total === 1 ? 'match' : 'matches'}
        </span>
      )}
    </div>
  );
}

/**
 * Estado vazio padrão das seções de recomendação.
 * @param {string} mensagem
 * @param {string} [dica]
 */
export function VazioRecomendacoes({ mensagem, dica }: { mensagem: string; dica?: string }) {
  return (
    <div className="text-center py-8 px-4">
      <p className="text-sm text-slate-500">{mensagem}</p>
      {dica && <p className="text-xs text-slate-400 mt-1">{dica}</p>}
    </div>
  );
}
