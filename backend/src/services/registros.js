/**
 * Feature 2 — Verificação de registros profissionais (CRM, COREN, CREFITO, CRP, CRN).
 *
 * Por padrão, valida só o FORMATO do número. Se quisermos consultar a API do
 * conselho (não temos acesso público em geral), ative CONSELHOS_API_URL.
 *
 * Cada conselho tem um formato esperado:
 *   - CRM:   6 dígitos + UF (ex: 123456-SP)
 *   - COREN: até 6 dígitos + UF (ex: 123456-SP)
 *   - CREFITO: 6 dígitos + / + UF + número (ex: 123456/SP-3)
 *   - CRP:   2 dígitos + / + até 6 dígitos (ex: 06/12345)
 *   - CRN:   4 dígitos + UF (ex: 1234-SP)
 *
 * Em produção, o ideal é chamar a API do conselho correspondente, mas como
 * muitas não expõem API pública, mantemos a validação de formato + selo
 * "Verificado" via admin (recurso manual confiável).
 */
const FORMATS = {
  CRM: { re: /^\d{4,7}-[A-Z]{2}$/, exemplo: '123456-SP' },
  COREN: { re: /^\d{3,6}-[A-Z]{2}$/, exemplo: '123456-SP' },
  CREFITO: { re: /^\d{4,7}\/[A-Z]{2}(-\d+)?$/, exemplo: '123456/SP-3' },
  CRP: { re: /^\d{1,2}\/\d{3,6}$/, exemplo: '06/12345' },
  CRN: { re: /^\d{3,6}-[A-Z]{2}$/, exemplo: '1234-SP' }
};

const UFS_VALIDAS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]);

export function validateRegistro(tipo, numero, uf) {
  if (!tipo || !FORMATS[tipo]) {
    return { ok: false, motivo: `Tipo de registro "${tipo}" não suportado.` };
  }
  if (!numero) {
    return { ok: false, motivo: 'Número de registro é obrigatório.' };
  }
  const numeroLimpo = numero.trim().toUpperCase();
  if (!FORMATS[tipo].re.test(numeroLimpo)) {
    return { ok: false, motivo: `Formato inválido para ${tipo}. Exemplo: ${FORMATS[tipo].exemplo}` };
  }
  // Confere UF se aplicável
  const matchUf = numeroLimpo.match(/-([A-Z]{2})(?:\b|-)/);
  if (matchUf && !UFS_VALIDAS.has(matchUf[1])) {
    return { ok: false, motivo: `UF inválida: ${matchUf[1]}` };
  }
  if (uf && !UFS_VALIDAS.has(uf.toUpperCase())) {
    return { ok: false, motivo: `UF inválida: ${uf}` };
  }
  return { ok: true, motivo: null, numero_normalizado: numeroLimpo };
}

export function tiposRegistroSuportados() {
  return Object.entries(FORMATS).map(([k, v]) => ({ tipo: k, exemplo: v.exemplo }));
}
