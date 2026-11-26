/**
 * Adapter para o Conselho Federal de Fisioterapia e Terapia Ocupacional (COFFITO/CREFITO).
 *
 * Estado real: o COFFITO (https://www.coffito.gov.br) tem busca
 * pública, mas a interface é renderizada via JS e o HTML do resultado
 * muda periodicamente. Sem parser resiliente, qualquer scraper
 * quebra na primeira atualização.
 *
 * Estratégia idêntica aos outros conselhos: env var opcional com URL
 * custom, fallback para `pendente`.
 */
export async function verificarCREFITO(registro) {
  const customUrl = process.env.CREFITO_VERIFICATION_URL;
  if (!customUrl) {
    return {
      encontrado: false,
      motivo: 'CREFITO sem API pública — verificação requer revisão manual'
    };
  }
  try {
    const r = await fetch(`${customUrl}?registro=${encodeURIComponent(registro)}`, {
      headers: { 'User-Agent': 'EssenciaDoCuidar/1.0 (verificacao-conselho)' }
    });
    if (!r.ok) return { encontrado: false, motivo: `CREFITO upstream ${r.status}` };
    const data = await r.json();
    return {
      encontrado: Boolean(data?.encontrado),
      nome: data?.nome,
      especialidade: data?.especialidade,
      situacao: data?.situacao
    };
  } catch (err) {
    return { encontrado: false, motivo: `CREFITO fetch falhou: ${err.message}` };
  }
}
