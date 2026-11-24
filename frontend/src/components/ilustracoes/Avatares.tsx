/**
 * components/ilustracoes/Avatares.tsx
 *
 * Avatares vetoriais do sistema "Essência do Cuidar". Substituem emojis
 * (👵🩺) e fotos quadradas por bustos desenhados na identidade dos roteiros.
 *
 * Arquitetura: uma base comum (fundo circular + recorte) e uma composição
 * por figura (torso, cabeça, cabelo, acessórios). Dois tons de pele por
 * prop `tom`, sem dependências externas e sem duplicação de gradientes —
 * cada instância usa `useId()` para IDs únicos de <defs>.
 */
import { useId } from 'react';
import { ESS } from './paleta';
import type { IlustracaoProps } from './Flora';

export type Tom = 'claro' | 'medio';
const PELE: Record<Tom, { base: string; sombra: string }> = {
  claro: { base: ESS.peleClara, sombra: ESS.peleSombra },
  medio: { base: ESS.peleMedia, sombra: ESS.cabeloCastanho }
};

interface AvatarProps extends IlustracaoProps {
  /** Tom de pele: 'claro' (default) ou 'medio'. */
  tom?: Tom;
}

/** Base circular com recorte: garantia de composição idêntica em todos. */
function BaseAvatar({ id, children, titulo, anel = ESS.dourado300, fundoA = ESS.creme50, fundoB = ESS.salvia100 }: {
  id: string;
  children: React.ReactNode;
  titulo?: string;
  anel?: string;
  fundoA?: string;
  fundoB?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
      className="block"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={fundoA} />
          <stop offset="1" stopColor={fundoB} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="58" fill={ESS.branco} />
      <g clipPath={`url(#${id}-clip)`}>
        <circle cx="60" cy="60" r="56" fill={`url(#${id}-bg)`} />
        {children}
      </g>
      <circle cx="60" cy="60" r="56" fill="none" stroke={anel} strokeWidth="3" />
    </svg>
  );
}

/** Olhos calorosos (arcos) + sorriso + bochechas — traço humano, não robótico. */
function Rosto({ pele, cx = 60, cy = 52, r = 17, sorriso = 0.7 }: {
  pele: string; cx?: number; cy?: number; r?: number; sorriso?: number;
}) {
  const y = cy;
  return (
    <g>
      {/* orelhas */}
      <circle cx={cx - r} cy={y + 2} r="3" fill={pele} />
      <circle cx={cx + r} cy={y + 2} r="3" fill={pele} />
      {/* sobrancelhas */}
      <path d={`M${cx - 10} ${y - 7} q 3 -2.6 7 -0.6`} stroke={ESS.cabeloCastanho} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d={`M${cx + 3} ${y - 7.6} q 4 -2 7 0.6`} stroke={ESS.cabeloCastanho} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* olhos — arcos suaves (calma e acolhimento) */}
      <path d={`M${cx - 9} ${y + 1} q 3 3 6 0`} stroke={ESS.florestaEscuro} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d={`M${cx + 3} ${y + 1} q 3 3 6 0`} stroke={ESS.florestaEscuro} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* nariz discreto */}
      <path d={`M${cx} ${y + 5} l -1.6 3.4 q 1.6 1.2 3.2 0`} stroke={ESS.peleSombra} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* sorriso */}
      <path
        d={`M${cx - 5} ${y + sorriso + 9} q 5 ${sorriso * 4} 10 0`}
        stroke={ESS.cabeloCastanho}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* bochechas */}
      <circle cx={cx - 10} cy={y + 8} r="2.6" fill={ESS.terracota} opacity="0.25" />
      <circle cx={cx + 10} cy={y + 8} r="2.6" fill={ESS.terracota} opacity="0.25" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarCuidadora — cuidadora de pessoa idosa, uniforme sálvia.       */
/* ------------------------------------------------------------------ */
export function AvatarCuidadora({ className, titulo, tom = 'claro' }: AvatarProps) {
  const uid = useId(); const id = `ac-${uid}`; const p = PELE[tom];
  return (
    <div className={className}>
      <BaseAvatar id={id} titulo={titulo}>
        {/* torso — scrubs sálvia com gola em V e pin dourado */}
        <path d="M28 122 C 30 96, 44 86, 60 86 C 76 86, 90 96, 92 122 Z" fill={ESS.salvia400} />
        <path d="M52 88 L 60 98 L 68 88 C 65 86, 55 86, 52 88 Z" fill={p.sombra} />
        <path d="M60 98 L 54 122 L 66 122 Z" fill={ESS.salvia300} />
        <circle cx="74" cy="102" r="2.6" fill={ESS.dourado400} />
        {/* pescoço */}
        <rect x="54" y="70" width="12" height="16" rx="5" fill={p.base} />
        <path d="M54 74 C 57 78, 63 78, 66 74" stroke={p.sombra} strokeWidth="1.4" fill="none" opacity="0.5" />
        {/* cabeça */}
        <circle cx="60" cy="52" r="18" fill={p.base} />
        {/* cabelo coque */}
        <path
          d="M42 52 C 40 36, 50 28, 60 28 C 70 28, 80 36, 78 52 C 78 40, 70 34, 60 34 C 50 34, 42 40, 42 52 Z"
          fill={ESS.cabeloCastanho}
        />
        <circle cx="60" cy="24" r="8" fill={ESS.cabeloCastanho} />
        <circle cx="60" cy="24" r="8" fill="none" stroke={ESS.dourado300} strokeWidth="1.6" />
        <Rosto pele={p.base} />
      </BaseAvatar>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarEnfermeira — técnico/auxiliar de enfermagem, jaleco branco.   */
/* ------------------------------------------------------------------ */
export function AvatarEnfermeira({ className, titulo, tom = 'medio' }: AvatarProps) {
  const uid = useId(); const id = `ae-${uid}`; const p = PELE[tom];
  return (
    <div className={className}>
      <BaseAvatar id={id} titulo={titulo} fundoA={ESS.salvia50} fundoB={ESS.creme100}>
        {/* torso — jaleco branco aberto sobre blusa sálvia */}
        <path d="M28 122 C 30 96, 44 86, 60 86 C 76 86, 90 96, 92 122 Z" fill={ESS.salvia200} />
        <path d="M28 122 C 30 96, 44 86, 60 86 C 76 86, 90 96, 92 122 L 84 122 C 82 102, 72 94, 60 94 C 48 94, 38 102, 36 122 Z" fill={ESS.branco} />
        <path d="M52 88 L 60 98 L 68 88 C 65 86, 55 86, 52 88 Z" fill={p.sombra} />
        {/* estetoscópio dourado */}
        <path d="M48 96 C 48 106, 54 112, 62 112" stroke={ESS.dourado600} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="64" cy="112" r="3.4" fill={ESS.dourado500} />
        {/* pescoço */}
        <rect x="54" y="70" width="12" height="16" rx="5" fill={p.base} />
        {/* cabeça + rabo de cavalo */}
        <circle cx="60" cy="52" r="18" fill={p.base} />
        <path
          d="M42 52 C 40 36, 50 28, 60 28 C 70 28, 80 36, 78 52 C 78 40, 70 34, 60 34 C 50 34, 42 40, 42 52 Z"
          fill={ESS.cabeloCastanho}
        />
        <path d="M78 46 C 86 46, 92 52, 92 62 C 92 70, 86 74, 82 72 C 86 64, 84 54, 78 50 Z" fill={ESS.cabeloCastanho} />
        <Rosto pele={p.base} />
      </BaseAvatar>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarMedico — médico, jaleco com estetoscópio e camisa azul.       */
/* ------------------------------------------------------------------ */
export function AvatarMedico({ className, titulo, tom = 'claro' }: AvatarProps) {
  const uid = useId(); const id = `am-${uid}`; const p = PELE[tom];
  return (
    <div className={className}>
      <BaseAvatar id={id} titulo={titulo} fundoA={ESS.creme50} fundoB={ESS.salvia100}>
        <path d="M28 122 C 30 96, 44 86, 60 86 C 76 86, 90 96, 92 122 Z" fill={ESS.branco} />
        {/* camisa azul por baixo */}
        <path d="M52 88 L 60 104 L 68 88 C 65 86, 55 86, 52 88 Z" fill={ESS.lapisLazuli} />
        {/* estetoscópio */}
        <path d="M72 96 C 72 104, 66 110, 58 112" stroke={ESS.florestaMedio} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="56" cy="112" r="3.2" fill={ESS.dourado500} />
        <rect x="54" y="70" width="12" height="16" rx="5" fill={p.base} />
        <circle cx="60" cy="52" r="18" fill={p.base} />
        {/* cabelo curto com risca */}
        <path
          d="M42 50 C 42 34, 52 28, 60 28 C 70 28, 79 35, 78 50 C 76 38, 68 33, 60 33 C 51 33, 44 39, 42 50 Z"
          fill={ESS.cabeloCastanhoClaro}
        />
        <Rosto pele={p.base} />
      </BaseAvatar>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarIdoso — paciente idoso, cardigã, óculos e cabelo grisalho.    */
/* ------------------------------------------------------------------ */
export function AvatarIdoso({ className, titulo, tom = 'claro' }: AvatarProps) {
  const uid = useId(); const id = `ai-${uid}`; const p = PELE[tom];
  return (
    <div className={className}>
      <BaseAvatar id={id} titulo={titulo} fundoA={ESS.creme100} fundoB={ESS.dourado50}>
        <path d="M28 122 C 30 98, 44 88, 60 88 C 76 88, 90 98, 92 122 Z" fill={ESS.salvia500} />
        {/* cardigã aberto */}
        <path d="M28 122 C 30 98, 44 88, 60 88 C 62 88, 64 88.5, 66 89 L 62 122 L 58 122 L 54 89 C 56 88.5, 58 88, 60 88" fill="none" />
        <path d="M52 90 L 56 122 L 64 122 L 68 90 C 65 89, 55 89, 52 90 Z" fill={ESS.arroz} />
        {/* botões dourados */}
        <circle cx="60" cy="100" r="1.8" fill={ESS.dourado400} />
        <circle cx="60" cy="110" r="1.8" fill={ESS.dourado400} />
        <rect x="54" y="72" width="12" height="16" rx="5" fill={p.base} />
        <circle cx="60" cy="54" r="18" fill={p.base} />
        {/* cabelo grisalho recuado */}
        <path
          d="M42 54 C 40 38, 50 30, 60 30 C 70 30, 80 38, 78 54 C 77 42, 70 35, 60 35 C 50 35, 43 42, 42 54 Z"
          fill={ESS.cabeloGrisalho}
        />
        {/* óculos redondos */}
        <g stroke={ESS.dourado600} strokeWidth="1.6" fill="none">
          <circle cx="52" cy="53" r="6" />
          <circle cx="68" cy="53" r="6" />
          <path d="M58 53 L 62 53" />
          <path d="M46 53 L 43 52" />
          <path d="M74 53 L 77 52" />
        </g>
        {/* olhos atrás dos óculos */}
        <circle cx="52" cy="54" r="1.7" fill={ESS.florestaEscuro} />
        <circle cx="68" cy="54" r="1.7" fill={ESS.florestaEscuro} />
        <path d={`M55 65 q 5 3.6 10 0`} stroke={ESS.cabeloCastanho} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="48" cy="62" r="2.6" fill={ESS.terracota} opacity="0.22" />
        <circle cx="72" cy="62" r="2.6" fill={ESS.terracota} opacity="0.22" />
      </BaseAvatar>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarIdosa — paciente idosa, coque grisalho, brinco pérola.        */
/* ------------------------------------------------------------------ */
export function AvatarIdosa({ className, titulo, tom = 'claro' }: AvatarProps) {
  const uid = useId(); const id = `ad-${uid}`; const p = PELE[tom];
  return (
    <div className={className}>
      <BaseAvatar id={id} titulo={titulo} fundoA={ESS.dourado50} fundoB={ESS.creme100}>
        <path d="M28 122 C 30 98, 44 88, 60 88 C 76 88, 90 98, 92 122 Z" fill={ESS.terracota} opacity="0.85" />
        {/* xale creme */}
        <path d="M46 92 L 60 108 L 74 92 C 70 90, 50 90, 46 92 Z" fill={ESS.arroz} />
        <rect x="54" y="72" width="12" height="16" rx="5" fill={p.base} />
        <circle cx="60" cy="54" r="18" fill={p.base} />
        <path
          d="M42 54 C 40 36, 50 28, 60 28 C 70 28, 80 36, 78 54 C 78 40, 70 33, 60 33 C 50 33, 42 40, 42 54 Z"
          fill={ESS.cabeloGrisalho}
        />
        <circle cx="60" cy="25" r="7" fill={ESS.cabeloGrisalho} />
        {/* brincos pérola */}
        <circle cx="42.5" cy="57" r="2.2" fill={ESS.branco} stroke={ESS.dourado300} strokeWidth="0.8" />
        <circle cx="77.5" cy="57" r="2.2" fill={ESS.branco} stroke={ESS.dourado300} strokeWidth="0.8" />
        <Rosto pele={p.base} cy={54} />
      </BaseAvatar>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarFamilia — família acolhendo: duas figuras lado a lado.        */
/* ------------------------------------------------------------------ */
export function AvatarFamilia({ className, titulo }: AvatarProps) {
  const uid = useId(); const id = `af-${uid}`;
  return (
    <div className={className}>
      <BaseAvatar id={id} titulo={titulo} anel={ESS.salvia300} fundoA={ESS.creme50} fundoB={ESS.salvia50}>
        {/* figura maior (avó/avô) */}
        <path d="M14 122 C 16 100, 28 92, 40 92 C 52 92, 62 100, 64 122 Z" fill={ESS.salvia400} />
        <circle cx="40" cy="70" r="14" fill={ESS.peleClara} />
        <path d="M28 68 C 27 56, 34 50, 40 50 C 47 50, 53 56, 52 68 C 50 58, 46 54, 40 54 C 34 54, 30 58, 28 68 Z" fill={ESS.cabeloGrisalho} />
        <circle cx="36" cy="72" r="1.4" fill={ESS.florestaEscuro} />
        <circle cx="44" cy="72" r="1.4" fill={ESS.florestaEscuro} />
        <path d="M36 78 q 4 2.8 8 0" stroke={ESS.cabeloCastanho} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* figura menor (neto(a)) abraçando pelo lado */}
        <path d="M56 122 C 58 106, 68 100, 80 100 C 92 100, 102 106, 104 122 Z" fill={ESS.terracota} opacity="0.9" />
        <circle cx="82" cy="84" r="12" fill={ESS.peleMedia} />
        <path d="M70 82 C 69 70, 76 65, 82 65 C 89 65, 95 70, 94 82 C 92 73, 88 69, 82 69 C 76 69, 72 73, 70 82 Z" fill={ESS.cabeloCastanho} />
        <circle cx="78.5" cy="86" r="1.3" fill={ESS.florestaEscuro} />
        <circle cx="85.5" cy="86" r="1.3" fill={ESS.florestaEscuro} />
        <path d="M78.5 90.5 q 3.5 2.4 7 0" stroke={ESS.cabeloCastanho} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* coração entre os dois */}
        <path
          d="M52 58 C 49 55.5, 46 52.5, 46 49.5 C 46 47, 48 45.5, 50 45.5 C 51 45.5, 51.7 46, 52 46.7 C 52.3 46, 53 45.5, 54 45.5 C 56 45.5, 58 47, 58 49.5 C 58 52.5, 55 55.5, 52 58 Z"
          fill={ESS.dourado500}
        />
      </BaseAvatar>
    </div>
  );
}
