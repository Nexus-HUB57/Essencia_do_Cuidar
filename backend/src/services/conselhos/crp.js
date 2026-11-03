/**
 * Adapter para o Conselho Federal de Psicologia (CFP/CRP).
 *
 * Estado real: o CFP (https://site.cfp.org.br) tem busca por região
 * em cada CRP estadual. O endpoint público retorna JSON quando há
 * CRSF válido, mas a integração sem browser é frágil.
 *
 * Estratégia: env var opcional, fallback gracioso.
 */
export async function verificarCRP(registro) {
  const customUrl = process.env.CRP_VERIFICATION_URL;
  if (!customUrl) {
    return {
      encontrado: false,
      motivo: 'CRP sem API pública — verificação requer revisão manual'
    };
  }
  try {
    const r = await fetch(`${customUrl}?registro=${encodeURIComponent(registro)}`, {
      headers: { 'User-Agent': 'EssenciaDoCuidar/1.0 (verificacao-conselho)' }
    });
    if (!r.ok) return { encontrado: false, motivo: `CRP upstream ${r.status}` };
    const data = await r.json();
    return {
      encontrado: Boolean(data?.encontrado),
      nome: data?.nome,
      especialidade: data?.especialidade,
      situacao: data?.situacao
    };
  } catch (err) {
    return { encontrado: false, motivo: `CRP fetch falhou: ${err.message}` };
  }
}
