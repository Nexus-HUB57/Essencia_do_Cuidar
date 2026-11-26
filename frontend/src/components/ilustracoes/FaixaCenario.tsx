/**
 * components/ilustracoes/FaixaCenario.tsx
 *
 * Faixa de cena para o topo de cards — usada nos cartões de plantão:
 * enfermagem recebe o cenário hospitalar, cuidador recebe o cenário
 * domiciliar. A cena entra em sua proporção natural (320×200), como um
 * cabeçalho de foto vetorial do card.
 */
import type { ReactNode } from 'react';
import type { IlustracaoProps } from './Flora';

interface Props extends IlustracaoProps {
  /** Componente de cena (de Cenarios). */
  cena: ReactNode;
}

export default function FaixaCenario({ cena, className }: Props) {
  return (
    <div className={`moldura-cenario ${className ?? ''}`}>
      <div className="[&>svg]:w-full [&>svg]:h-auto [&>svg]:block">{cena}</div>
    </div>
  );
}
