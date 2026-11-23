/**
 * components/ilustracoes/Flora.tsx
 *
 * Elementos botânicos da identidade "Essência do Cuidar" (roteiros oficiais:
 * ramos dourados, folhagens sálvia e o emblema mãos + coração-folha).
 *
 * Tudo é SVG inline: zero requisições, escala em qualquer DPI, herda o
 * tema do app e aceita as classes de animação (.ilustracao-oscilar etc.)
 * via `className`. Decoração é aria-hidden; emblema carrega role="img".
 */
import { useId } from 'react';
import { ESS } from './paleta';

export interface IlustracaoProps {
  /** Classes extras (largura/altura, margens, animações de essência). */
  className?: string;
  /** Espelha horizontalmente (ramo de canto esquerdo → direito). */
  flip?: boolean;
  /** Título acessível; sem título a ilustração é decorativa (aria-hidden). */
  titulo?: string;
}

/* ------------------------------------------------------------------ */
/* RamoBotanico — ramo arqueado com folhas douradas em pares opostos.  */
/* Assinatura dos roteiros; usado em cantos, divisores e molduras.     */
/* ------------------------------------------------------------------ */
export function RamoBotanico({ className, flip, titulo }: IlustracaoProps) {
  const uid = useId();
  const g = `rb-${uid}`;
  return (
    <svg
      viewBox="0 0 220 140"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={g} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={ESS.dourado600} />
          <stop offset="1" stopColor={ESS.dourado300} />
        </linearGradient>
      </defs>
      <g transform={flip ? 'scale(-1,1) translate(-220,0)' : undefined} fill={`url(#${g})`}>
        {/* haste principal em arco suave */}
        <path
          d="M8 132 C 60 122, 128 92, 172 44 C 186 28, 196 16, 206 6"
          fill="none"
          stroke={`url(#${g})`}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* folhas — pares opostos ao longo da haste, curvas orgânicas */}
        <path d="M52 121 C 40 108, 42 94, 52 84 C 66 96, 66 112, 52 121 Z" />
        <path d="M56 126 C 72 118, 86 122, 92 132 C 78 142, 62 138, 56 126 Z" />
        <path d="M104 99 C 94 84, 98 70, 110 62 C 122 76, 120 92, 104 99 Z" />
        <path d="M108 104 C 124 100, 136 108, 138 120 C 122 126, 110 118, 108 104 Z" />
        <path d="M148 66 C 140 52, 146 38, 158 32 C 168 46, 164 62, 148 66 Z" />
        <path d="M152 72 C 168 70, 178 78, 178 90 C 162 94, 152 86, 152 72 Z" />
        <path d="M182 34 C 176 22, 182 10, 192 6 C 200 18, 196 32, 182 34 Z" />
        <path d="M186 40 C 200 40, 208 48, 206 58 C 192 60, 184 52, 186 40 Z" />
        {/* broto final */}
        <path d="M206 6 C 210 2, 214 1, 218 2 C 216 8, 212 10, 206 6 Z" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* DivisorBotanico — separador horizontal: linha — folhas — linha.     */
/* Reproduz o ornamento central dos roteiros ("NOSSOS SERVIÇOS").      */
/* ------------------------------------------------------------------ */
export function DivisorBotanico({ className, titulo }: IlustracaoProps) {
  const uid = useId();
  const g = `db-${uid}`;
  return (
    <svg
      viewBox="0 0 480 48"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ESS.dourado400} />
          <stop offset="1" stopColor={ESS.dourado300} />
        </linearGradient>
      </defs>
      {/* linhas laterais afinando para o centro */}
      <line x1="8" y1="24" x2="196" y2="24" stroke={`url(#${g})`} strokeWidth="2" strokeLinecap="round" />
      <line x1="284" y1="24" x2="472" y2="24" stroke={`url(#${g})`} strokeWidth="2" strokeLinecap="round" />
      <circle cx="200" cy="24" r="2.4" fill={ESS.dourado400} />
      <circle cx="280" cy="24" r="2.4" fill={ESS.dourado400} />
      {/* ramo central simétrico */}
      <g fill={ESS.dourado400}>
        <path d="M240 34 C 234 28, 234 20, 240 14 C 246 20, 246 28, 240 34 Z" />
        <path d="M228 30 C 226 22, 230 16, 236 14 C 238 22, 235 28, 228 30 Z" opacity="0.85" />
        <path d="M252 30 C 254 22, 250 16, 244 14 C 242 22, 245 28, 252 30 Z" opacity="0.85" />
        <path d="M218 28 C 216 22, 218 17, 223 15 C 226 20, 224 26, 218 28 Z" opacity="0.65" />
        <path d="M262 28 C 264 22, 262 17, 257 15 C 254 20, 256 26, 262 28 Z" opacity="0.65" />
        <path d="M240 12 C 238 8, 239 5, 240 3 C 241 5, 242 8, 240 12 Z" opacity="0.9" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* VinhaCanto — vinha delicada para cantos de seções (hero/CTA).       */
/* ------------------------------------------------------------------ */
export function VinhaCanto({ className, flip, titulo }: IlustracaoProps) {
  const uid = useId();
  const g = `vc-${uid}`;
  return (
    <svg
      viewBox="0 0 160 160"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={g} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={ESS.dourado500} />
          <stop offset="1" stopColor={ESS.dourado200} />
        </linearGradient>
      </defs>
      <g transform={flip ? 'scale(-1,1) translate(-160,0)' : undefined}>
        <path
          d="M6 154 C 30 130, 52 118, 84 104 C 116 90, 138 66, 148 30"
          fill="none"
          stroke={`url(#${g})`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <g fill={`url(#${g})`}>
          <path d="M36 132 C 26 122, 27 110, 36 102 C 46 112, 45 124, 36 132 Z" />
          <path d="M64 116 C 56 106, 58 95, 66 88 C 76 97, 74 109, 64 116 Z" opacity="0.9" />
          <path d="M96 98 C 90 88, 93 78, 102 72 C 110 82, 106 92, 96 98 Z" opacity="0.8" />
          <path d="M124 66 C 120 56, 124 47, 132 43 C 138 53, 134 62, 124 66 Z" opacity="0.75" />
          <path d="M144 34 C 142 26, 146 19, 152 17 C 156 26, 152 32, 144 34 Z" opacity="0.7" />
          {/* bagos */}
          <circle cx="52" cy="124" r="3" opacity="0.7" />
          <circle cx="86" cy="106" r="3" opacity="0.65" />
          <circle cx="116" cy="80" r="3" opacity="0.6" />
          <circle cx="140" cy="48" r="2.6" opacity="0.55" />
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CoracaoMaos — emblema da marca: mãos acolhendo coração-folha.       */
/* É o "Cuidar com amor é a nossa essência" desenhado.                 */
/* ------------------------------------------------------------------ */
export function CoracaoMaos({ className, titulo }: IlustracaoProps) {
  const uid = useId();
  const gc = `cm-c-${uid}`;
  const gf = `cm-f-${uid}`;
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={gc} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ESS.dourado500} />
          <stop offset="1" stopColor={ESS.dourado300} />
        </linearGradient>
        <linearGradient id={gf} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ESS.peleClara} />
          <stop offset="1" stopColor={ESS.peleMedia} />
        </linearGradient>
      </defs>
      {/* coração-folha: metade coração, metade folha com nervura */}
      <g>
        <path
          d="M60 78 C 40 62, 28 50, 28 36 C 28 24, 38 16, 48 16 C 54 16, 58 19, 60 23 C 62 19, 66 16, 72 16 C 82 16, 92 24, 92 36 C 92 50, 80 62, 60 78 Z"
          fill={`url(#${gc})`}
        />
        <path
          d="M60 23 C 60 38, 60 56, 60 74"
          stroke={ESS.creme50}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M60 38 C 54 36, 50 32, 48 26"
          stroke={ESS.creme50}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
        <path
          d="M60 50 C 66 48, 70 44, 72 38"
          stroke={ESS.creme50}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
      </g>
      {/* mãos acolhendo por baixo (traço elegante, não realista) */}
      <g fill={`url(#${gf})`}>
        <path d="M26 92 C 30 84, 40 82, 48 86 C 54 89, 58 90, 60 90 C 62 90, 66 89, 72 86 C 80 82, 90 84, 94 92 C 90 100, 78 106, 60 106 C 42 106, 30 100, 26 92 Z" />
        <path d="M44 88 C 42 84, 44 80, 48 80 C 52 80, 54 83, 54 87" fill="none" stroke={ESS.peleSombra} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M76 88 C 78 84, 76 80, 72 80 C 68 80, 66 83, 66 87" fill="none" stroke={ESS.peleSombra} strokeWidth="1.4" strokeLinecap="round" />
      </g>
      {/* brilho dourado */}
      <circle cx="92" cy="22" r="3" fill={ESS.dourado300} opacity="0.9" />
      <circle cx="100" cy="32" r="2" fill={ESS.dourado300} opacity="0.7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* FolhaSolta — folha única para acentos e marcadores de lista.        */
/* ------------------------------------------------------------------ */
export function FolhaSolta({ className, flip, titulo }: IlustracaoProps) {
  const uid = useId();
  const g = `fs-${uid}`;
  return (
    <svg
      viewBox="0 0 40 48"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={g} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={ESS.salvia600} />
          <stop offset="1" stopColor={ESS.salvia300} />
        </linearGradient>
      </defs>
      <g transform={flip ? 'scale(-1,1) translate(-40,0)' : undefined}>
        <path d="M20 4 C 32 14, 34 30, 20 44 C 6 30, 8 14, 20 4 Z" fill={`url(#${g})`} />
        <path d="M20 8 L 20 40" stroke={ESS.creme50} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" fill="none" />
        <path d="M20 18 L 13 14 M20 26 L 27 22" stroke={ESS.creme50} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" fill="none" />
      </g>
    </svg>
  );
}
