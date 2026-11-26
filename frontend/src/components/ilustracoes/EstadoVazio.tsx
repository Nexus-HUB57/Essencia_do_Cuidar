/**
 * components/ilustracoes/EstadoVazio.tsx
 *
 * Estado vazio padrão do app: cena "sala quieta" (CenarioVazio) com o
 * texto de i18n por cima. Usado nos painéis (vagas, candidaturas,
 * histórico) no lugar dos blocos de texto solto.
 */
import type { ReactNode } from 'react';
import { CenarioVazio } from './Cenarios';

interface Props {
  /** Mensagem principal (string traduzida ou nó <Trans>). */
  mensagem: ReactNode;
  /** Texto opcional de apoio/dica. */
  dica?: string;
  /** Altura da cena em classes Tailwind (default h-32). */
  alturaCena?: string;
}

export default function EstadoVazio({ mensagem, dica, alturaCena = 'h-32' }: Props) {
  return (
    <div className="text-center py-8 px-4">
      <div className={`mx-auto max-w-xs ${alturaCena}`}>
        <CenarioVazio className="w-full h-full" />
      </div>
      <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">{mensagem}</p>
      {dica && <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{dica}</p>}
    </div>
  );
}
