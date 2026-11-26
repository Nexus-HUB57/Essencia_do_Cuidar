/**
 * Restrição geográfica de atuação — Essência do Cuidar.
 *
 * Decisão de produto: o sistema atende EXCLUSIVAMENTE a RMC (Região
 * Metropolitana de Campinas) e a UF é sempre SP. Toda vaga publicada
 * precisa pertencer a um dos 20 municípios oficiais da região.
 *
 * A lista abaixo segue a composição oficial da RMC (LC estadual 870/2000,
 * com Morungaba adicionado pela Lei 1.234/2014 — 20 municípios). É a fonte
 * única de verdade do backend; o frontend mantém um espelho em
 * `frontend/src/constants/rmc.ts` apenas para renderizar o <select>, e a
 * validação autoritativa acontece AQUI (nunca confiar no cliente).
 */

/** UF única atendida pelo sistema. */
export const UF_UNICA = 'SP';

/** Os 20 municípios oficiais da Região Metropolitana de Campinas. */
export const RMC_MUNICIPIOS = [
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

/**
 * Normaliza texto para comparação: remove acentos (NFD), colapsa
 * espaços, trim e lowercase. "santa  bárbara d'oeste" vira
 * "santa barbara d'oeste".
 */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * true se `nome` é exatamente um dos 20 municípios da RMC
 * (ignora acentos, caixa e espaços extras).
 */
export function regiaoPertenceRmc(nome) {
  const alvo = normalizarTexto(nome);
  if (!alvo) return false;
  return RMC_MUNICIPIOS.some((m) => normalizarTexto(m) === alvo);
}
