/**
 * Adapter para o Conselho Federal de Nutrição (CFN/CRN).
 *
 * Estado real: o CFN (https://www.cfn.org.br) tem busca pública, mas
 * a interface é server-rendered com tokens de sessão. Scraping é
 * possível mas quebra com frequência.
 *
 * Estratégia: env var opcional, fallback gracioso.
 */
export async function verificarCRN(registro) {
  const customUrl = process.env.CRN_VERIFICATION_URL;
  if (!customUrl) {
    return {
      encontrado: false,
      motivo: 'CRN sem API pública — verificação requer revisão manual'
    };
  }
  try {
    const r = await fetch(`${customUrl}?registro=${encodeURIComponent(registro)}`, {
      headers: { 'User-Agent': 'EssenciaDoCuidar/1.0 (verificacao-conselho)' }
    });
    if (!r.ok) return { encontrado: false, motivo: `CRN upstream ${r.status}` };
    const data = await r.json();
    return {
      encontrado: Boolean(data?.encontrado),
      nome: data?.nome,
      especialidade: data?.especialidade,
      situacao: data?.situacao
    };
  } catch (err) {
    return { encontrado: false, motivo: `CRN fetch falhou: ${err.message}` };
  }
}
