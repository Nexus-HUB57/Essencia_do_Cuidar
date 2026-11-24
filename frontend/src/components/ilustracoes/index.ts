/**
 * components/ilustracoes/index.ts
 *
 * Ponto de entrada do sistema de ilustrações "Essência do Cuidar".
 * Fauna + flora + avatares + cenários com uma única paleta (paleta.ts)
 * e um único vocabulário de animação (index.css).
 */
export { ESS, GRAD_DOURADO, GRAD_SALVIA } from './paleta';
export type { IlustracaoProps } from './Flora';
export { RamoBotanico, DivisorBotanico, VinhaCanto, CoracaoMaos, FolhaSolta } from './Flora';
export { BeijaFlor, Borboleta, Passarinho } from './Fauna';
export {
  AvatarCuidadora,
  AvatarEnfermeira,
  AvatarMedico,
  AvatarIdoso,
  AvatarIdosa,
  AvatarFamilia
} from './Avatares';
export type { Tom } from './Avatares';
export {
  CenarioDomiciliar,
  CenarioHospitalar,
  CenarioConsulta,
  CenarioJardim,
  CenarioVazio
} from './Cenarios';

/* Componentes compostos de UI construídos sobre as ilustrações. */
export { default as EstadoVazio } from './EstadoVazio';
export { default as FaixaCenario } from './FaixaCenario';
