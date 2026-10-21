/**
 * Adapter para o Conselho Federal de Enfermagem (COREN).
 *
 * Estado real (2026-10): o COFEN (http://www.cofen.gov.br) centraliza
 * a busca, mas cada COREN estadual tem portal próprio com padrões
 * divergentes. A busca federal exige JS dinâmico, o que torna
 * verificação 100% automatizada frágil.
 *
 * Estratégia:
 *   - Se `COREN_VERIFICATION_URL` estiver configurada, usa.
 *   - Senão, devolve `pendente` para revisão manual.
 *
 * Quando o usuário for ligar produção, considerar:
 *   - Ceder profissionais para confirmarem via link do COFEN;
 *   - Usar serviço pago (Nuvem Fiscal) que tem cobertura.
 */
export async function verificarCOREN(registro) {
  const customUrl = process.env.COREN_VERIFICATION_URL;
  if (!customUrl) {
    return {
      encontrado: false,
      motivo: 'COREN sem API pública — verificação requer revisão manual'
    };
  }
  try {
    const r = await fetch(`${customUrl}?registro=${encodeURIComponent(registro)}`, {
      headers: { 'User-Agent': 'EssenciaDoCuidar/1.0 (verificacao-conselho)' }
    });
    if (!r.ok) return { encontrado: false, motivo: `COREN upstream ${r.status}` };
    const data = await r.json();
    return {
      encontrado: Boolean(data?.encontrado),
      nome: data?.nome,
      categoria: data?.categoria,
      situacao: data?.situacao
    };
  } catch (err) {
    return { encontrado: false, motivo: `COREN fetch falhou: ${err.message}` };
  }
}
