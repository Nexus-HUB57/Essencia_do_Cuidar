/**
 * Adapter para o Conselho Federal de Medicina (CFM).
 *
 * Estado real (2026-10): o portal público do CFM
 * (https://portal.cfm.org.br/busca-medicos) exige captcha visual,
 * o que torna verificação automatizada inviável sem serviços pagos
 * de terceiros (Nuvem Fiscal, etc.).
 *
 * Para manter o sistema funcional sem dependências pagas:
 *   1. Se a env `CRM_VERIFICATION_URL` apontar para uma API interna
 *      ou espelho já decifrado, usamos.
 *   2. Caso contrário, retornamos `encontrado: false` com motivo claro
 *      e o sistema marca o profissional como `pendente` para revisão
 *      manual via painel admin.
 *
 * Referências (verificar antes de automatizar):
 *   - https://portal.cfm.org.br/
 *   - Cada CRM estadual (ex: CREMESP) tem portal próprio.
 */
export async function verificarCRM(registro) {
  const customUrl = process.env.CRM_VERIFICATION_URL;
  if (!customUrl) {
    return {
      encontrado: false,
      motivo: 'CRM sem API pública — verificação requer revisão manual'
    };
  }
  // Quando o usuário configurar uma URL real, este adapter faz a request.
  try {
    const r = await fetch(`${customUrl}?registro=${encodeURIComponent(registro)}`, {
      headers: { 'User-Agent': 'EssenciaDoCuidar/1.0 (verificacao-conselho)' }
    });
    if (!r.ok) return { encontrado: false, motivo: `CRM upstream ${r.status}` };
    const data = await r.json();
    return {
      encontrado: Boolean(data?.encontrado),
      nome: data?.nome,
      especialidade: data?.especialidade,
      situacao: data?.situacao
    };
  } catch (err) {
    return { encontrado: false, motivo: `CRM fetch falhou: ${err.message}` };
  }
}
