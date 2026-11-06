/**
 * Serialização de `profissionais_detalhes` para a API.
 *
 * As colunas `especialidades` e `disponibilidade` são gravadas como TEXT
 * (JSON string) no banco, mas o frontend trabalha com arrays (`string[]`)
 * — o `DashboardProfissional` chama `.join(', ')` nelas. Se a API devolver
 * a string crua, o `.join` quebra com TypeError.
 *
 * Por isso TODA rota que devolve `detalhes` precisa passar por aqui.
 */

export function parseDetalhes(detalhes) {
  if (!detalhes) return detalhes;
  const out = { ...detalhes };
  try { out.especialidades = JSON.parse(out.especialidades || '[]'); }
  catch { out.especialidades = []; }
  try { out.disponibilidade = JSON.parse(out.disponibilidade || '[]'); }
  catch { out.disponibilidade = []; }
  if (!Array.isArray(out.especialidades)) out.especialidades = [];
  if (!Array.isArray(out.disponibilidade)) out.disponibilidade = [];
  return out;
}

/**
 * Busca o detalhe de um profissional e devolve já normalizado.
 */
export async function buscarDetalhes(idUser) {
  const db = (await import('../db/driver.js')).default;
  const row = await db.get('SELECT * FROM profissionais_detalhes WHERE id_user = ?', [idUser]);
  return parseDetalhes(row);
}

export default parseDetalhes;
