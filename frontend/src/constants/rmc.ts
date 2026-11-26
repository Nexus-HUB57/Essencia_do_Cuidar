/**
 * Restrição geográfica — espelho do backend.
 *
 * O sistema atende APENAS a RMC (Região Metropolitana de Campinas) e a UF
 * é sempre SP. Esta lista é o espelho de `backend/src/utils/rmc.js` e só
 * serve para renderizar o <select> do formulário de vagas — a validação
 * autoritativa acontece sempre no servidor (POST /api/vagas).
 *
 * Composição oficial da RMC: 20 municípios (LC estadual 870/2000 +
 * Lei 1.234/2014, que adicionou Morungaba).
 */

/** UF única atendida pelo sistema. */
export const UF_UNICA = 'SP';

/** Os 20 municípios oficiais da Região Metropolitana de Campinas. */
export const RMC_MUNICIPIOS: string[] = [
  'Americana',
  'Artur Nogueira',
  'Campinas',
  'Cosmópolis',
  'Engenheiro Coelho',
  'Holambra',
  'Hortolândia',
  'Indaiatuba',
  'Itatiba',
  'Jaguariúna',
  'Monte Mor',
  'Morungaba',
  'Nova Odessa',
  'Paulínia',
  'Pedreira',
  "Santa Bárbara d'Oeste",
  'Santo Antônio de Posse',
  'Sumaré',
  'Valinhos',
  'Vinhedo'
];
