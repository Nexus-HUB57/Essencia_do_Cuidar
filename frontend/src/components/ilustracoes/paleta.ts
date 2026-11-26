/**
 * components/ilustracoes/paleta.ts
 *
 * Fonte única de cores do sistema de ilustrações "Essência do Cuidar".
 * Espelha a identidade dos roteiros oficiais (verde sálvia, dourado,
 * creme e floresta) e a paleta já usada no app (serenity/emerald).
 *
 * Toda cor aqui é constante: ilustração determinística, sem valores
 * aleatórios no render. O Tailwind (tailwind.config.js) carrega o
 * mesmo esquema sob `essencia.*` para uso nos layouts.
 */

export const ESS = {
  // Verdes
  floresta: '#1D4B3E',
  florestaEscuro: '#122E27',
  florestaMedio: '#2A5F50',
  salvia50: '#EEF3EC',
  salvia100: '#E3ECE1',
  salvia200: '#C8D8C4',
  salvia300: '#AEC3AB',
  salvia400: '#8CA38B',
  salvia500: '#6E8F6C',
  salvia600: '#557A52',
  salvia700: '#4A6B47',

  // Dourados (ramos, detalhes de luz)
  dourado50: '#FBF6E9',
  dourado100: '#F3E7C8',
  dourado200: '#E8D8A6',
  dourado300: '#DDBD72',
  dourado400: '#C9A24B',
  dourado500: '#B08A35',
  dourado600: '#8F6E28',

  // Neutros quentes (pele, fundos)
  creme50: '#FBF8F1',
  creme100: '#F7F2E7',
  creme200: '#EFE7D6',
  peleClara: '#F2D7BE',
  peleMedia: '#E0B896',
  peleSombra: '#C99B72',

  // Cabelos
  cabeloCastanho: '#5A4634',
  cabeloCastanhoClaro: '#7A6248',
  cabeloGrisalho: '#C9C2B8',
  cabeloGrisalhoEscuro: '#9C948A',

  // Roupas / utilidade
  lapisLazuli: '#4A90E2', // serenity (mantida para coerência do app)
  branco: '#FFFFFF',
  linho: '#E9E2D4',
  terracota: '#C97B5A',
  arroz: '#F5EFDF'
} as const;

/** Gradiente dourado padrão dos ramos botânicos. */
export const GRAD_DOURADO = [ESS.dourado600, ESS.dourado300] as const;

/** Gradiente verde padrão das folhagens. */
export const GRAD_SALVIA = [ESS.salvia600, ESS.salvia300] as const;
