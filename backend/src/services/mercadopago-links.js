/**
 * services/mercadopago-links.js
 *
 * Catálogo de "Plantões avulsos" vendidos via Payment Link do Mercado Pago.
 *
 * Diferente do PDC (Pix via API em services/mercadopago.js), aqui o checkout
 * é HOSPEADO no Mercado Pago: cada plantão tem um Payment Link configurado na
 * conta do MP e o usuário paga por cartão, Pix e outros meios. A reconciliação
 * acontece pelo webhook, que casa o pagamento pelo `external_reference`.
 *
 * DUAS DESCOBERTAS QUE DEFINEM O FORMATO DA URL (verificadas contra o
 * checkout real do MP em 23/11/2026):
 *
 * 1. O short link `mpago.la/<slug>` responde 301 e DESCARTA a query string —
 *    não dá para anexar `external_reference` nele. A URL de redirect oficial
 *    (`/payment-link/v1/redirect?link-id=...`) aceita e preserva.
 *    Por isso montamos sempre a URL de redirect, nunca o short link.
 *
 * 2. O MP responde 403 quando o `notification_url` aponta para host não
 *    público. Payment Links não levam notification_url na query de checkout:
 *    o webhook do link é configurado no painel do MP (ou globalmente na
 *    conta). Aqui só montamos a URL de checkout com o external_reference.
 *
 * Link IDs reais entram por env vars (ver DEPLOY.md, seção "Plantões"):
 *   MERCADOPAGO_LINK_ENF_12H / _8H / _6H   — enfermagem 12/8/6 horas
 *   MERCADOPAGO_LINK_CUI_12H / _8H / _6H   — cuidador de idoso 12/8/6 horas
 * Sem env var o módulo usa um id de demonstração, para o fluxo rodar em
 * dev/teste sem credenciais — em produção, configure os 6 links reais.
 *
 * Os preços abaixo foram conferidos contra o checkout real de cada link
 * (não são presumidos).
 */

const MP_REDIRECT_BASE = 'https://www.mercadopago.com.br/payment-link/v1/redirect';

export const FAMILIAS = ['enfermagem', 'cuidador'];

export const CATALOGO_PLANTOES = [
  {
    id: 'enfermagem-12h',
    titulo: 'Plantão de Enfermagem — 12 horas',
    familia: 'enfermagem',
    horas: 12,
    preco_centavos: 25000,
    envKey: 'MERCADOPAGO_LINK_ENF_12H',
    demoLinkId: 'DEMO-ENF-12H'
  },
  {
    id: 'enfermagem-8h',
    titulo: 'Plantão de Enfermagem — 8 horas',
    familia: 'enfermagem',
    horas: 8,
    preco_centavos: 20000,
    envKey: 'MERCADOPAGO_LINK_ENF_8H',
    demoLinkId: 'DEMO-ENF-8H'
  },
  {
    id: 'enfermagem-6h',
    titulo: 'Plantão de Enfermagem — 6 horas',
    familia: 'enfermagem',
    horas: 6,
    preco_centavos: 15000,
    envKey: 'MERCADOPAGO_LINK_ENF_6H',
    demoLinkId: 'DEMO-ENF-6H'
  },
  {
    id: 'cuidador-12h',
    titulo: 'Plantão de Cuidador de Idoso — 12 horas',
    familia: 'cuidador',
    horas: 12,
    preco_centavos: 20000,
    envKey: 'MERCADOPAGO_LINK_CUI_12H',
    demoLinkId: 'DEMO-CUI-12H'
  },
  {
    id: 'cuidador-8h',
    titulo: 'Plantão de Cuidador de Idoso — 8 horas',
    familia: 'cuidador',
    horas: 8,
    preco_centavos: 18000,
    envKey: 'MERCADOPAGO_LINK_CUI_8H',
    demoLinkId: 'DEMO-CUI-8H'
  },
  {
    id: 'cuidador-6h',
    titulo: 'Plantão de Cuidador de Idoso — 6 horas',
    familia: 'cuidador',
    horas: 6,
    preco_centavos: 12000,
    envKey: 'MERCADOPAGO_LINK_CUI_6H',
    demoLinkId: 'DEMO-CUI-6H'
  }
];

/**
 * Lista o catálogo, opcionalmente filtrado por família.
 * @param {string} [familia] 'enfermagem' | 'cuidador'
 * @returns {Array<Object>} plantões (sem detalhes internos de env)
 */
export function listarPlantoes(familia) {
  const itens = familia
    ? CATALOGO_PLANTOES.filter(p => p.familia === familia)
    : CATALOGO_PLANTOES;
  return itens.map(plantaPublico);
}

/**
 * Busca um plantão do catálogo pelo id público.
 * @param {string} id ex.: 'enfermagem-12h'
 */
export function getPlantao(id) {
  return CATALOGO_PLANTOES.find(p => p.id === id) || null;
}

/**
 * Id do Payment Link usado no checkout: env var quando configurada,
 * senão o id de demonstração (dev/teste).
 * @param {Object} plantao entrada do catálogo
 * @returns {string} link-id
 */
export function getLinkId(plantao) {
  const doEnv = process.env[plantao.envKey];
  return (doEnv && doEnv.trim()) || plantao.demoLinkId;
}

/**
 * Monta a URL de checkout hospedado do Mercado Pago preservando o
 * external_reference (a chave de reconciliação do webhook).
 * @param {Object} plantao entrada do catálogo
 * @param {string} externalReference ex.: 'PLANTAO-enfermagem-12h-...'
 * @returns {string} URL do checkout
 */
export function montarCheckoutUrl(plantao, externalReference) {
  const linkId = getLinkId(plantao);
  return `${MP_REDIRECT_BASE}?link-id=${encodeURIComponent(linkId)}&external_reference=${encodeURIComponent(externalReference)}`;
}

/**
 * Gera a external_reference de um pagamento de plantão. Prefixo 'PLANTAO-'
 * é o que o webhook usa para separar estes pagamentos dos PDCs de custódia.
 */
export function novaExternalReference(plantaoId) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PLANTAO-${plantaoId}-${Date.now()}-${rand}`;
}

/**
 * Projeção pública do plantão (preço precisa aparecer para quem decide).
 */
function plantaPublico(p) {
  return {
    id: p.id,
    titulo: p.titulo,
    familia: p.familia,
    horas: p.horas,
    preco_centavos: p.preco_centavos,
    preco: (p.preco_centavos / 100).toFixed(2).replace('.', ','),
    preco_formatado: `R$ ${(p.preco_centavos / 100).toFixed(2).replace('.', ',')}`
  };
}
