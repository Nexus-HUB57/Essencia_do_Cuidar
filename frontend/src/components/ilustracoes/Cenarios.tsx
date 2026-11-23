/**
 * components/ilustracoes/Cenarios.tsx
 *
 * Cenas ilustradas do "Essência do Cuidar" — os "cenários" dos roteiros:
 * cuidado domiciliar, acompanhamento hospitalar, consultas/exames e o
 * jardim da essência. Além de CenarioVazio para estados sem registro.
 *
 * Composição em camadas (fundo → mobília → figuras → detalhes de luz),
 * paleta única da marca e figuras em traço simplificado com pontos de
 * atenção nos olhos. Todas as cenas herdam moldura via .moldura-cenario
 * e são aria-hidden por padrão (texto vem do entorno).
 */
import { useId, Fragment } from 'react';
import { ESS } from './paleta';
import type { IlustracaoProps } from './Flora';

/* ----------------------- blocos reutilizáveis ----------------------- */

/** Janela com luz quente e cortina dourada. */
function Janela({ id, x, y, w, h, luz = '#EAF3F7' }: {
  id: string; x: number; y: number; w: number; h: number; luz?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill={luz} />
      <rect x={x} y={y} width={w} height={h} rx="6" fill="none" stroke={ESS.floresta} strokeWidth="3" />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={ESS.floresta} strokeWidth="2" />
      <line x1={x} y1={y + h / 2} x2={x + w / 2} y2={y + h / 2} stroke={ESS.floresta} strokeWidth="2" />
      {/* cortina dourada */}
      <path
        d={`M${x - 6} ${y - 4} C ${x + 10} ${y + 14}, ${x + 8} ${y + h * 0.6}, ${x + 4} ${y + h + 4} L ${x - 6} ${y + h + 4} Z`}
        fill={ESS.dourado100}
      />
      <circle id={`${id}-sol`} cx={x + w - 12} cy={y + 12} r="5" fill={ESS.dourado300} opacity="0.85" />
    </g>
  );
}

/** Vaso de planta terracota com folhagem sálvia. */
function Vaso({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C -2 14, -6 22, -8 26 L 8 26 C 6 22, 2 14, 0 0 Z" fill={ESS.terracota} transform="translate(0 24)" />
      <rect x="-10" y="48" width="20" height="4" rx="2" fill={ESS.terracota} opacity="0.8" />
      <path d="M0 26 C -12 16, -18 4, -14 -8 C -4 -4, 0 6, 0 26 Z" fill={ESS.salvia500} />
      <path d="M0 26 C 12 16, 18 4, 14 -8 C 4 -4, 0 6, 0 26 Z" fill={ESS.salvia600} />
      <path d="M0 26 C 0 12, 2 0, 8 -10 C 10 2, 6 14, 0 26 Z" fill={ESS.salvia400} opacity="0.9" />
    </g>
  );
}

/** Quadro simples com folha (a "essência" na parede). */
function QuadroFolha({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="26" height="32" rx="3" fill={ESS.creme50} stroke={ESS.dourado400} strokeWidth="2" />
      <path d={`M${x + 13} ${y + 24} C ${x + 6} ${y + 18}, ${x + 7} ${y + 11}, ${x + 13} ${y + 8} C ${x + 19} ${y + 11}, ${x + 20} ${y + 18}, ${x + 13} ${y + 24} Z`} fill={ESS.salvia500} />
      <path d={`M${x + 13} ${y + 10} L ${x + 13} ${y + 23}`} stroke={ESS.creme50} strokeWidth="1" opacity="0.7" />
    </g>
  );
}

/** Figura de cabeça + tronco (miniatura das cenas). */
function Figura({ x, y, pele, roupa, cabelo, s = 1, flip }: {
  x: number; y: number; pele: string; roupa: string; cabelo: string; s?: number; flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s}, ${s})`}>
      <circle cx="0" cy="0" r="7.5" fill={pele} />
      <path d="M-7 -1.5 C -6.4 -7, -3 -9.5, 0 -9.5 C 3 -9.5, 6.4 -7, 7 -1.5 C 5 -5.5, 2.6 -7, 0 -7 C -2.6 -7, -5 -5.5, -7 -1.5 Z" fill={cabelo} />
      <circle cx="-2.6" cy="-0.4" r="0.9" fill={ESS.florestaEscuro} />
      <circle cx="2.6" cy="-0.4" r="0.9" fill={ESS.florestaEscuro} />
      <path d="M-1.6 2.4 q 1.6 1.4 3.2 0" stroke={ESS.cabeloCastanho} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      {/* tronco */}
      <path d="M-8 32 C -7.4 14, -4 8, 0 8 C 4 8, 7.4 14, 8 32 Z" fill={roupa} />
    </g>
  );
}

/** Chão com rodapé — base comum de todas as cenas internas. */
function Chao({ id, y = 156 }: { id: string; y?: number }) {
  void id;
  return (
    <g>
      <rect x="0" y={y} width="320" height={200 - y} fill={ESS.arroz} />
      <rect x="0" y={y} width="320" height="4" fill={ESS.creme200} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* CenarioDomiciliar — sala de casa: cuidadora offering chá à idosa     */
/* confortável no poltrona. O coração do produto.                      */
/* ------------------------------------------------------------------ */
export function CenarioDomiciliar({ className, titulo }: IlustracaoProps) {
  const uid = useId(); const id = `cd-${uid}`;
  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={`${id}-parede`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ESS.creme100} />
          <stop offset="1" stopColor={ESS.salvia50} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-parede)`} />
      <Janela id={id} x={228} y={30} w={72} h={58} />
      <QuadroFolha x={30} y={34} />

      <Chao id={id} />

      {/* tapete */}
      <ellipse cx="150" cy="184" rx="118" ry="10" fill={ESS.dourado100} opacity="0.8" />

      {/* poltrona sálvia com idosa */}
      <g>
        <path d="M64 118 C 64 104, 76 98, 88 98 L 128 98 C 140 98, 152 104, 152 118 L 152 152 L 64 152 Z" fill={ESS.salvia400} />
        <path d="M64 118 C 58 118, 54 122, 54 130 L 54 152 L 64 152 Z" fill={ESS.salvia500} />
        <path d="M152 118 C 158 118, 162 122, 162 130 L 162 152 L 152 152 Z" fill={ESS.salvia500} />
        <rect x="62" y="152" width="14" height="6" rx="3" fill={ESS.floresta} />
        <rect x="140" y="152" width="14" height="6" rx="3" fill={ESS.floresta} />
        {/* almofada */}
        <rect x="88" y="112" width="56" height="20" rx="8" fill={ESS.creme50} />
        {/* idosa sentada */}
        <Figura x={108} y={82} pele={ESS.peleClara} roupa={ESS.terracota} cabelo={ESS.cabeloGrisalho} s={1.15} />
        {/* manta no colo */}
        <path d="M96 116 C 104 112, 116 112, 124 116 L 122 128 L 98 128 Z" fill={ESS.dourado100} />
      </g>

      {/* cuidadora de pé oferecendo xícara */}
      <g>
        <Figura x={210} y={70} pele={ESS.peleMedia} roupa={ESS.salvia500} cabelo={ESS.cabeloCastanho} s={1.45} />
        {/* braço com bandeja/xícara */}
        <path d="M216 96 C 224 100, 232 104, 238 108" stroke={ESS.peleMedia} strokeWidth="4" strokeLinecap="round" fill="none" />
        <rect x="232" y="104" width="22" height="4" rx="2" fill={ESS.dourado400} />
        <path d="M238 92 L 246 92 L 244 102 L 240 102 Z" fill={ESS.branco} stroke={ESS.dourado400} strokeWidth="1.2" />
        <path d="M246 95 C 250 95, 250 99, 246 99" stroke={ESS.dourado400} strokeWidth="1.2" fill="none" />
        {/* vapor */}
        <path d="M241 88 q 1.4 -3 0 -6 M245 88 q 1.4 -3 0 -6" stroke={ESS.salvia300} strokeWidth="1.1" fill="none" strokeLinecap="round" className="ilustracao-brilhar" />
      </g>

      <Vaso x={34} y={126} s={0.95} />
      {/* detalhe de luz no chão */}
      <ellipse cx="264" cy="170" rx="26" ry="5" fill={ESS.dourado200} opacity="0.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CenarioHospitalar — quarto hospitalar: enfermeira, monitor e leito. */
/* ------------------------------------------------------------------ */
export function CenarioHospitalar({ className, titulo }: IlustracaoProps) {
  const uid = useId(); const id = `ch-${uid}`;
  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={`${id}-parede`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF3F7" />
          <stop offset="1" stopColor={ESS.salvia50} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-parede)`} />
      <Janela id={id} x={26} y={28} w={66} h={54} />

      {/* placa de enfermaria com cruz */}
      <g>
        <rect x="126" y="34" width="56" height="20" rx="4" fill={ESS.branco} stroke={ESS.salvia300} strokeWidth="1.6" />
        <rect x="147" y="39" width="14" height="4" rx="1.4" fill={ESS.salvia500} />
        <rect x="152" y="34" width="4" height="14" rx="1.4" fill={ESS.salvia500} />
      </g>

      <Chao id={id} />

      {/* leito hospitalar com paciente */}
      <g>
        <rect x="58" y="118" width="130" height="10" rx="4" fill={ESS.creme200} />
        <rect x="58" y="128" width="8" height="30" fill={ESS.florestaMedio} />
        <rect x="180" y="128" width="8" height="30" fill={ESS.florestaMedio} />
        <rect x="44" y="104" width="10" height="44" rx="4" fill={ESS.salvia300} />
        {/* colchão */}
        <rect x="66" y="106" width="116" height="14" rx="6" fill={ESS.branco} />
        <rect x="66" y="104" width="30" height="12" rx="5" fill={ESS.creme50} />
        {/* paciente coberto */}
        <circle cx="108" cy="100" r="8" fill={ESS.peleClara} />
        <path d="M101 97 C 102 92.5, 105 91, 108 91 C 111 91, 114 92.5, 115 97 C 112 93.6, 110 92.6, 108 92.6 C 105 92.6, 103 93.6, 101 97 Z" fill={ESS.cabeloGrisalho} />
        <circle cx="106" cy="100" r="0.8" fill={ESS.florestaEscuro} />
        <circle cx="110" cy="100" r="0.8" fill={ESS.florestaEscuro} />
        <path d="M116 104 C 130 102, 150 103, 166 107 L 166 118 L 116 118 Z" fill={ESS.dourado100} />
        {/* soro ao lado */}
        <rect x="196" y="86" width="3" height="66" fill={ESS.florestaMedio} />
        <path d="M190 78 L 205 78 L 197.5 70 Z" fill={ESS.florestaMedio} />
        <rect x="191" y="88" width="13" height="18" rx="3" fill="#DBEAF2" stroke={ESS.lapisLazuli} strokeWidth="1.4" />
        <path d="M197.5 106 C 197.5 112, 194 114, 190 116" stroke={ESS.lapisLazuli} strokeWidth="1.2" fill="none" />
      </g>

      {/* monitor */}
      <g>
        <rect x="226" y="112" width="52" height="38" rx="5" fill={ESS.florestaEscuro} />
        <rect x="230" y="116" width="44" height="26" rx="3" fill="#0E2420" />
        <path d="M232 132 C 238 132, 240 122, 246 122 C 252 122, 252 134, 258 134 C 264 134, 266 124, 272 124" stroke={ESS.dourado300} strokeWidth="1.8" fill="none" className="ilustracao-brilhar" />
        <rect x="246" y="150" width="10" height="5" fill={ESS.florestaEscuro} />
      </g>

      {/* enfermeira conferindo soro */}
      <Figura x={252} y={64} pele={ESS.peleMedia} roupa={ESS.branco} cabelo={ESS.cabeloCastanho} s={1.35} />
      <path d="M258 88 C 252 94, 246 98, 240 100" stroke={ESS.peleMedia} strokeWidth="3.6" strokeLinecap="round" fill="none" />
      {/* prancheta */}
      <rect x="224" y="96" width="12" height="16" rx="2" fill={ESS.arroz} stroke={ESS.dourado400} strokeWidth="1.2" />
      <path d="M227 102 L 233 102 M 227 106 L 233 106" stroke={ESS.salvia500} strokeWidth="1" />

      <Vaso x={300} y={130} s={0.7} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CenarioConsulta — acompanhamento em consultas e exames: caminhada   */
/* com apoio até a unidade de saúde.                                   */
/* ------------------------------------------------------------------ */
export function CenarioConsulta({ className, titulo }: IlustracaoProps) {
  const uid = useId(); const id = `cc-${uid}`;
  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={`${id}-ceu`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7F0F4" />
          <stop offset="1" stopColor={ESS.creme100} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-ceu)`} />

      {/* unidade de saúde ao fundo */}
      <g>
        <rect x="196" y="46" width="104" height="92" rx="6" fill={ESS.branco} stroke={ESS.salvia300} strokeWidth="2" />
        <rect x="196" y="46" width="104" height="18" rx="6" fill={ESS.salvia300} />
        {/* cruz em relevo na fachada */}
        <rect x="240" y="72" width="16" height="5" rx="1.6" fill={ESS.salvia500} />
        <rect x="245.5" y="66.5" width="5" height="16" rx="1.6" fill={ESS.salvia500} />
        {/* porta e janelas */}
        <rect x="228" y="96" width="20" height="42" rx="3" fill={ESS.dourado100} stroke={ESS.dourado400} strokeWidth="1.6" />
        <rect x="206" y="96" width="12" height="12" rx="2" fill="#DBEAF2" stroke={ESS.salvia300} strokeWidth="1.2" />
        <rect x="258" y="96" width="12" height="12" rx="2" fill="#DBEAF2" stroke={ESS.salvia300} strokeWidth="1.2" />
      </g>
      {/* sol */}
      <circle cx="52" cy="44" r="16" fill={ESS.dourado200} opacity="0.9" />
      <circle cx="52" cy="44" r="9" fill={ESS.dourado300} />

      {/* calçada */}
      <rect x="0" y="150" width="320" height="10" fill={ESS.creme200} />
      <rect x="0" y="160" width="320" height="40" fill={ESS.arroz} />
      <path d="M0 170 H 320 M 0 182 H 320" stroke={ESS.creme200} strokeWidth="2" />

      {/* dupla caminhando: cuidadora conduz idosa de bengala */}
      <g>
        {/* idosa com bengala */}
        <Figura x={96} y={84} pele={ESS.peleClara} roupa={ESS.terracota} cabelo={ESS.cabeloGrisalho} s={1.3} />
        <path d="M84 116 C 82 128, 81 138, 81 148" stroke={ESS.dourado600} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="81" cy="80" r="2" fill={ESS.dourado600} />
        {/* pernas */}
        <path d="M92 122 L 90 148 M 102 122 L 104 148" stroke={ESS.peleSombra} strokeWidth="3.4" strokeLinecap="round" />
        {/* sapatos */}
        <path d="M86 149 L 94 149 M 100 149 L 108 149" stroke={ESS.florestaEscuro} strokeWidth="3" strokeLinecap="round" />
        {/* braço da cuidadora dando apoio */}
        <Figura x={128} y={72} pele={ESS.peleMedia} roupa={ESS.salvia500} cabelo={ESS.cabeloCastanho} s={1.3} />
        <path d="M122 100 C 114 106, 106 110, 100 112" stroke={ESS.peleMedia} strokeWidth="3.6" strokeLinecap="round" fill="none" />
        <path d="M124 122 L 122 148 M 134 122 L 136 148" stroke={ESS.peleSombra} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M118 149 L 126 149 M 132 149 L 140 149" stroke={ESS.florestaEscuro} strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* flora urbana — a essência presente na rua */}
      <g>
        <path d="M38 150 C 34 136, 36 122, 44 112 C 52 122, 52 136, 46 150 Z" fill={ESS.salvia500} />
        <path d="M44 150 C 46 138, 52 130, 60 126 C 58 138, 52 146, 44 150 Z" fill={ESS.salvia400} />
        <circle cx="48" cy="108" r="4" fill={ESS.dourado300} />
        <circle cx="60" cy="122" r="3" fill={ESS.dourado300} />
        <rect x="40" y="150" width="10" height="5" rx="2" fill={ESS.terracota} />
      </g>
      <g opacity="0.9">
        <path d="M172 150 C 168 138, 170 126, 178 118 C 184 126, 184 138, 178 150 Z" fill={ESS.salvia400} />
        <circle cx="180" cy="114" r="3.6" fill={ESS.dourado300} />
        <rect x="172" y="150" width="9" height="4.5" rx="2" fill={ESS.terracota} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CenarioJardim — o jardim da essência: caminho, flores e beija-flor. */
/* É a cena-assinatura: o lugar onde o cuidado floresce.               */
/* ------------------------------------------------------------------ */
export function CenarioJardim({ className, titulo }: IlustracaoProps) {
  const uid = useId(); const id = `cj-${uid}`;
  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={`${id}-ceu`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7F0F4" />
          <stop offset="1" stopColor={ESS.dourado50} />
        </linearGradient>
        <linearGradient id={`${id}-flor`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ESS.dourado300} />
          <stop offset="1" stopColor={ESS.terracota} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-ceu)`} />

      {/* sol radiante */}
      <circle cx="60" cy="52" r="20" fill={ESS.dourado200} />
      <circle cx="60" cy="52" r="12" fill={ESS.dourado300} />
      <g stroke={ESS.dourado300} strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M60 24 V 16 M 60 80 V 88 M 32 52 H 24 M 88 52 H 96 M 40 32 L 34 26 M 80 32 L 86 26 M 40 72 L 34 78 M 80 72 L 86 78" />
      </g>

      {/* colinas suaves */}
      <path d="M0 128 C 70 108, 150 108, 320 132 L 320 200 L 0 200 Z" fill={ESS.salvia100} />
      <path d="M0 156 C 90 138, 210 140, 320 160 L 320 200 L 0 200 Z" fill={ESS.salvia200} />

      {/* caminho do jardim */}
      <path d="M138 200 C 142 176, 150 156, 166 140 L 182 148 C 168 162, 158 180, 154 200 Z" fill={ESS.dourado100} />

      {/* flores em primeiro plano */}
      <g>
        {[52, 92, 232, 274].map((fx, i) => (
          <Fragment key={fx}>
            <path d={`M${fx} 176 C ${fx - 2} 156, ${fx + 2} 140, ${fx} 124`} stroke={ESS.salvia600} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx={fx} cy={118 - (i % 2) * 8} r="7" fill={`url(#${id}-flor)`} />
            <circle cx={fx} cy={118 - (i % 2) * 8} r="2.6" fill={ESS.dourado600} />
            <path d={`M${fx - 8} ${148 + (i % 2) * 6} C ${fx - 14} ${144 + (i % 2) * 6}, ${fx - 16} ${138 + (i % 2) * 6}, ${fx - 12} ${132 + (i % 2) * 6} C ${fx - 6} ${136 + (i % 2) * 6}, ${fx - 4} ${142 + (i % 2) * 6}, ${fx - 8} ${148 + (i % 2) * 6} Z`} fill={ESS.salvia500} />
          </Fragment>
        ))}
      </g>

      {/* arbusto com bagas */}
      <g>
        <ellipse cx="288" cy="150" rx="26" ry="18" fill={ESS.salvia500} />
        <ellipse cx="306" cy="158" rx="18" ry="13" fill={ESS.salvia400} />
        <circle cx="282" cy="142" r="2.6" fill={ESS.dourado400} />
        <circle cx="296" cy="138" r="2.6" fill={ESS.dourado400} />
        <circle cx="304" cy="150" r="2.6" fill={ESS.dourado400} />
      </g>

      {/* beija-flor planando sobre as flores */}
      <g className="ilustracao-planar" style={{ transformOrigin: '180px 60px' }}>
        <g transform="translate(168 38) scale(0.42)">
          <path
            d="M70 58 C 88 44, 118 46, 134 62 C 144 72, 148 86, 144 100 C 140 112, 128 118, 116 114 C 100 108, 84 96, 74 82 C 68 74, 64 66, 70 58 Z"
            fill={ESS.florestaMedio}
          />
          <circle cx="66" cy="56" r="13" fill={ESS.florestaMedio} />
          <path d="M56 52 C 40 46, 22 40, 6 34 C 22 44, 40 52, 56 58 Z" fill={ESS.florestaEscuro} />
          <circle cx="64" cy="52" r="3.4" fill={ESS.florestaEscuro} />
          <path d="M92 66 C 70 30, 92 8, 122 10 C 146 12, 158 34, 150 52 C 138 76, 112 78, 92 66 Z" fill={ESS.dourado200} opacity="0.9" className="ilustracao-asas" style={{ transformOrigin: '92px 66px' }} />
          <path d="M132 106 C 148 116, 164 122, 182 124 C 168 130, 150 128, 136 122 Z" fill={ESS.salvia600} />
          <path d="M76 74 C 86 92, 100 104, 116 112 C 106 116, 94 112, 86 102 C 78 92, 74 82, 76 74 Z" fill={ESS.dourado300} opacity="0.9" />
        </g>
      </g>

      {/* borboleta distante */}
      <g transform="translate(262 78) scale(0.24)" className="ilustracao-animada">
        <ellipse cx="0" cy="0" rx="4" ry="16" fill={ESS.floresta} />
        <path d="M0 -4 C 8 -22, 28 -30, 40 -24 C 44 -10, 26 0, 0 -4 Z" fill={ESS.dourado300} />
        <path d="M0 -4 C -8 -22, -28 -30, -40 -24 C -44 -10, -26 0, 0 -4 Z" fill={ESS.dourado300} />
        <path d="M0 6 C 6 14, 16 22, 24 24 C 24 14, 14 6, 0 6 Z" fill={ESS.dourado200} />
        <path d="M0 6 C -6 14, -16 22, -24 24 C -24 14, -14 6, 0 6 Z" fill={ESS.dourado200} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CenarioVazio — estado vazio: sala quieta, planta e passarinho.      */
/* "Ainda não há nada por aqui — e tudo está em ordem."                */
/* ------------------------------------------------------------------ */
export function CenarioVazio({ className, titulo }: IlustracaoProps) {
  const uid = useId(); const id = `cv-${uid}`;
  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id={`${id}-parede`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ESS.creme100} />
          <stop offset="1" stopColor={ESS.salvia50} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-parede)`} />
      <Chao id={id} y={150} />

      {/* janela ampla com luz */}
      <Janela id={id} x={110} y={36} w={100} h={76} />

      {/* passarinho pousado no parapeito */}
      <g transform="translate(178 92) scale(0.3)">
        <path d="M30 62 C 18 54, 8 52, 4 56 C 12 66, 22 72, 34 72 Z" fill={ESS.salvia600} />
        <path d="M34 66 C 34 46, 52 34, 72 36 C 92 38, 106 52, 106 66 C 106 80, 92 88, 72 88 C 52 88, 34 82, 34 66 Z" fill={ESS.salvia400} />
        <path d="M88 52 C 98 58, 102 66, 100 74 C 94 82, 82 86, 70 86 C 82 78, 88 66, 88 52 Z" fill={ESS.creme100} opacity="0.9" />
        <circle cx="100" cy="44" r="12" fill={ESS.salvia400} />
        <path d="M110 42 C 118 40, 124 40, 128 42 C 124 46, 118 47, 110 46 Z" fill={ESS.dourado600} />
        <circle cx="103" cy="41" r="2.6" fill={ESS.florestaEscuro} />
      </g>

      {/* prateleira com vasinho e livro */}
      <rect x="40" y="118" width="90" height="5" rx="2.5" fill={ESS.dourado400} />
      <Vaso x={64} y={84} s={0.62} />
      <rect x="86" y="100" width="10" height="18" rx="1.5" fill={ESS.terracota} opacity="0.85" />
      <rect x="97" y="102" width="9" height="16" rx="1.5" fill={ESS.salvia400} />

      {/* poltroninha vazia aguardando */}
      <g opacity="0.92">
        <path d="M228 112 C 228 102, 236 98, 246 98 L 262 98 C 272 98, 280 102, 280 112 L 280 140 L 228 140 Z" fill={ESS.salvia300} />
        <rect x="228" y="140" width="52" height="10" rx="4" fill={ESS.salvia400} />
        <rect x="232" y="150" width="8" height="6" rx="3" fill={ESS.floresta} />
        <rect x="268" y="150" width="8" height="6" rx="3" fill={ESS.floresta} />
      </g>
      <ellipse cx="160" cy="182" rx="120" ry="8" fill={ESS.dourado100} opacity="0.55" />
    </svg>
  );
}
