/**
 * components/ilustracoes/Fauna.tsx
 *
 * Fauna da identidade "Essência do Cuidar": beija-flor (agilidade do
 * cuidado), borboleta (leveza) e passarinho (companhia cotidiana).
 *
 * As asas usam grupos com classe `ilustracao-asas` (batida sutil) e o
 * corpo pode receber `ilustracao-planar`/`ilustracao-animada` no wrapper —
 * todas desligadas sob prefers-reduced-motion (ver index.css).
 */
import { useId } from 'react';
import { ESS } from './paleta';
import type { IlustracaoProps } from './Flora';

/* ------------------------------------------------------------------ */
/* BeijaFlor — corpo esmeralda, peito dourado, asas em batida suave.   */
/* Pensa num único ponto: o cuidado atento, sem pressa e sem pausa.    */
/* ------------------------------------------------------------------ */
export function BeijaFlor({ className, titulo }: IlustracaoProps) {
  const uid = useId();
  const gc = `bf-c-${uid}`;   // corpo
  const ga = `bf-a-${uid}`;   // asas
  const gb = `bf-p-${uid}`;   // peito
  return (
    <svg
      viewBox="0 0 200 160"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={gc} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ESS.salvia500} />
          <stop offset="0.55" stopColor={ESS.florestaMedio} />
          <stop offset="1" stopColor={ESS.floresta} />
        </linearGradient>
        <linearGradient id={gb} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ESS.dourado300} />
          <stop offset="1" stopColor={ESS.dourado100} />
        </linearGradient>
        <linearGradient id={ga} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ESS.dourado200} stopOpacity="0.95" />
          <stop offset="1" stopColor={ESS.dourado400} stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {/* asa superior (levanta/baixa com essenciaAsas) */}
      <g className="ilustracao-asas" style={{ transformOrigin: '92px 66px' }}>
        <path
          d="M92 66 C 70 30, 92 8, 122 10 C 146 12, 158 34, 150 52 C 138 76, 112 78, 92 66 Z"
          fill={`url(#${ga})`}
          opacity="0.9"
        />
        <path
          d="M96 62 C 84 40, 96 20, 118 18"
          stroke={ESS.dourado600}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />
      </g>
      {/* asa traseira (contra-batida, levemente atrás) */}
      <g className="ilustracao-asas" style={{ transformOrigin: '96px 72px', animationDelay: '0.45s' }}>
        <path
          d="M96 72 C 76 62, 58 64, 46 76 C 60 92, 82 92, 96 84 Z"
          fill={`url(#${ga})`}
          opacity="0.55"
        />
      </g>

      {/* corpo arqueado em mergulho suave */}
      <path
        d="M70 58 C 88 44, 118 46, 134 62 C 144 72, 148 86, 144 100 C 140 112, 128 118, 116 114 C 100 108, 84 96, 74 82 C 68 74, 64 66, 70 58 Z"
        fill={`url(#${gc})`}
      />
      {/* peito dourado */}
      <path
        d="M76 74 C 86 92, 100 104, 116 112 C 106 116, 94 112, 86 102 C 78 92, 74 82, 76 74 Z"
        fill={`url(#${gb})`}
        opacity="0.9"
      />
      {/* cabeça */}
      <circle cx="66" cy="56" r="13" fill={`url(#${gc})`} />
      {/* bico fino e longo — precisão do cuidado */}
      <path
        d="M56 52 C 40 46, 22 40, 6 34 C 22 44, 40 52, 56 58 Z"
        fill={ESS.florestaEscuro}
      />
      {/* olho com brilho */}
      <circle cx="64" cy="52" r="3.4" fill={ESS.florestaEscuro} />
      <circle cx="65.2" cy="50.8" r="1.1" fill={ESS.creme50} />
      {/* cauda bifurcada */}
      <path
        d="M132 106 C 148 116, 164 122, 182 124 C 168 130, 150 128, 136 122 Z"
        fill={ESS.florestaMedio}
      />
      <path
        d="M128 112 C 140 126, 150 136, 160 148 C 146 144, 134 132, 126 120 Z"
        fill={ESS.salvia600}
        opacity="0.9"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Borboleta — asas simétricas douradas com nervuras delicadas.        */
/* ------------------------------------------------------------------ */
export function Borboleta({ className, titulo }: IlustracaoProps) {
  const uid = useId();
  const ga = `bo-a-${uid}`;
  const gb = `bo-b-${uid}`;
  return (
    <svg
      viewBox="0 0 140 110"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={ga} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ESS.dourado300} />
          <stop offset="1" stopColor={ESS.dourado500} />
        </linearGradient>
        <linearGradient id={gb} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ESS.dourado200} />
          <stop offset="1" stopColor={ESS.dourado400} />
        </linearGradient>
      </defs>
      {/* asa superior direita — espelhada à esquerda */}
      <g className="ilustracao-asas" style={{ transformOrigin: '70px 52px' }}>
        <g>
          <path
            d="M70 52 C 76 30, 96 16, 114 20 C 130 24, 136 40, 128 52 C 120 64, 96 66, 70 52 Z"
            fill={`url(#${ga})`}
          />
          <path d="M74 50 C 90 44, 108 42, 122 46" stroke={ESS.dourado600} strokeWidth="1.3" fill="none" opacity="0.5" />
          <circle cx="112" cy="34" r="4.5" fill={ESS.creme50} opacity="0.8" />
        </g>
        <g transform="scale(-1,1) translate(-140,0)">
          <path
            d="M70 52 C 76 30, 96 16, 114 20 C 130 24, 136 40, 128 52 C 120 64, 96 66, 70 52 Z"
            fill={`url(#${ga})`}
          />
          <path d="M74 50 C 90 44, 108 42, 122 46" stroke={ESS.dourado600} strokeWidth="1.3" fill="none" opacity="0.5" />
          <circle cx="112" cy="34" r="4.5" fill={ESS.creme50} opacity="0.8" />
        </g>
        {/* asas inferiores */}
        <path
          d="M70 58 C 80 70, 96 84, 108 88 C 112 78, 106 64, 92 58 Z"
          fill={`url(#${gb})`}
          opacity="0.9"
        />
        <g transform="scale(-1,1) translate(-140,0)">
          <path
            d="M70 58 C 80 70, 96 84, 108 88 C 112 78, 106 64, 92 58 Z"
            fill={`url(#${gb})`}
            opacity="0.9"
          />
        </g>
      </g>
      {/* corpo + antenas */}
      <ellipse cx="70" cy="56" rx="4" ry="16" fill={ESS.floresta} />
      <circle cx="70" cy="40" r="4" fill={ESS.floresta} />
      <path
        d="M68 38 C 62 30, 56 26, 48 24 M72 38 C 78 30, 84 26, 92 24"
        stroke={ESS.floresta}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="48" cy="24" r="1.8" fill={ESS.floresta} />
      <circle cx="92" cy="24" r="1.8" fill={ESS.floresta} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Passarinho — pequeno pássaro pousado, sálvia com peito creme.       */
/* ------------------------------------------------------------------ */
export function Passarinho({ className, flip, titulo }: IlustracaoProps) {
  const uid = useId();
  const gc = `pa-c-${uid}`;
  return (
    <svg
      viewBox="0 0 140 110"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={gc} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ESS.salvia400} />
          <stop offset="1" stopColor={ESS.salvia600} />
        </linearGradient>
      </defs>
      <g transform={flip ? 'scale(-1,1) translate(-140,0)' : undefined}>
        {/* cauda */}
        <path d="M30 62 C 18 54, 8 52, 4 56 C 12 66, 22 72, 34 72 Z" fill={ESS.salvia600} />
        {/* corpo */}
        <path
          d="M34 66 C 34 46, 52 34, 72 36 C 92 38, 106 52, 106 66 C 106 80, 92 88, 72 88 C 52 88, 34 82, 34 66 Z"
          fill={`url(#${gc})`}
        />
        {/* peito creme */}
        <path
          d="M88 52 C 98 58, 102 66, 100 74 C 94 82, 82 86, 70 86 C 82 78, 88 66, 88 52 Z"
          fill={ESS.creme100}
          opacity="0.9"
        />
        {/* asa dobrada */}
        <path
          d="M52 58 C 64 50, 82 50, 94 58 C 86 68, 66 70, 52 62 Z"
          fill={ESS.florestaMedio}
          opacity="0.85"
        />
        {/* cabeça */}
        <circle cx="100" cy="44" r="12" fill={`url(#${gc})`} />
        <path d="M110 42 C 118 40, 124 40, 128 42 C 124 46, 118 47, 110 46 Z" fill={ESS.dourado600} />
        <circle cx="103" cy="41" r="2.6" fill={ESS.florestaEscuro} />
        <circle cx="104" cy="40.2" r="0.9" fill={ESS.creme50} />
        {/* patinhas */}
        <path d="M70 88 L 70 96 M 66 96 L 74 96 M 82 86 L 84 96 M 80 96 L 88 96" stroke={ESS.dourado600} strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
