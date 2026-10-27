/**
 * services/registroValidator.js
 *
 * Validador estrutural de registros profissionais brasileiros.
 *
 * IMPORTANTE: nenhum conselho profissional brasileiro (CRM, COREN,
 * CREFITO, CRP, CRN) expoe API publica oficial para consulta de
 * registros. O que esta camada faz e:
 *
 *   1. Validar o FORMATO do numero informado (regex por conselho/UF).
 *      Isso descarta erros grosseiros de digitacao e padroniza a forma
 *      de armazenamento, mas NAO garante que o registro existe.
 *
 *   2. Sinalizar o estado na coluna `registro_verificado`:
 *        1 = validado estruturalmente (selo "Verificado" na UI)
 *        2 = pendente de analise manual (selo "Em analise" na UI)
 *
 *   3. Quando um conselho EXPOR API oficial no futuro, basta criar
 *      uma funcao `verifyCouncil(registro)` que retorne um objeto
 *      `{ ok: boolean, motivo?: string }` e plugar no fluxo abaixo.
 *      Hoje retornamos `{ ok: true, motivo: "regex_ok" }` para que
 *      o sistema exiba o selo desde ja.
 *
 * Este modulo e puro (sem I/O), o que facilita teste unitario e
 * reuso em diferentes rotas.
 */

import { verificarRegistro } from "./conselhos/index.js";

/**
 * Regex por conselho. Cada entrada produz um objeto RegExp que
 * valida o NUMERO (sem o prefixo do conselho). Aceitamos variacoes
 * comuns: separadores espaco/hifen, com/sem UF.
 *
 * IMPORTANTE — estes padroes foram alinhados com `services/registros.js`
 * (FORMATS) e com o placeholder do frontend ("Ex: 123456-SP ou 06/12345").
 * Antes desta unificacao os dois validadores discordavam: o frontend
 * pedia "123456-SP" e so passava pelo fallback, enquanto este modulo
 * exigia "COREN-SP-123456". Agora ambos aceitam o mesmo conjunto.
 *
 * Fontes dos formatos:
 *   - COREN: <UF> + 4-6 digitos (ex: "SP 123456" ou "SP-123456")
 *             OU digitos-UF canonico (ex: "123456-SP")
 *             OU com prefixo (ex: "COREN-SP-123456")
 *   - CRM:   4-6 digitos + "/" + UF (ex: "123456/SP")
 *             OU digitos-UF canonico (ex: "123456-SP")
 *   - CREFITO: 4-6 digitos + "-" + letra (ex: "12345-F")
 *             OU digitos/UF canonico (ex: "123456/SP-3")
 *   - CRP:   2 digitos + "/" + 4-5 digitos (ex: "06/12345")
 *   - CRN:   4-6 digitos + "/" + UF (ex: "12345/RJ")
 *             OU digitos-UF canonico (ex: "1234-SP")
 */
const REGEX_POR_CONSELHO = {
  COREN: /^(?:COREN[-\s]?([A-Z]{2})[-\s]?(\d{4,6})|([A-Z]{2})[-\s](\d{4,6})|(\d{3,6})[-\s]([A-Z]{2}))$/i,
  CRM:   /^(?:\d{4,6})[\/\-\s]([A-Z]{2})$/i,
  CREFITO: /^(?:CREFITO[-\s]?(\d{4,6})[-\s]?([A-Z])|(\d{4,7})[\/\-]([A-Z]{2})(?:[-\s]?(\d+))?)$/i,
  CRP:   /^(\d{1,2})[\/\-\s](\d{3,6})$/i,
  CRN:   /^(?:\d{3,6})[\/\-\s]([A-Z]{2})$/i
};

/**
 * Normaliza o numero para o formato canonico antes de salvar.
 * - Remove espacos duplicados
 * - Coloca prefixo do conselho em maiusculas
 * - Mantem case original do resto
 */
function normalize(tipo, numero) {
  if (!numero) return null;
  const trimmed = String(numero).trim().replace(/\s+/g, " ");
  if (tipo && REGEX_POR_CONSELHO[tipo.toUpperCase()]) {
    // Garante que o prefixo do conselho (quando houver) fique em maiusculas
    return trimmed.replace(
      new RegExp(`^${tipo}\\s*`, "i"),
      `${tipo.toUpperCase()} `
    );
  }
  return trimmed;
}

/**
 * Valida o numero de registro. Retorna:
 *   { ok: true,  motivo: "regex_ok" }        -> pode ganhar selo
 *   { ok: false, motivo: "regex_invalido", detalle: "<regex que falhou>" }
 *
 * @param {string} tipo_registro  - "CRM" | "COREN" | "CREFITO" | "CRP" | "CRN" | "OUTRO"
 * @param {string} registro_conselho - numero a validar
 */
function validate(tipo_registro, registro_conselho) {
  if (!tipo_registro || !registro_conselho) {
    return { ok: false, motivo: "dados_incompletos" };
  }
  const tipo = String(tipo_registro).toUpperCase();
  // OUTRO nao tem regex - apenas checa tamanho minimo e que nao eh vazio.
  if (tipo === "OUTRO") {
    if (String(registro_conselho).trim().length < 3) {
      return { ok: false, motivo: "muito_curto" };
    }
    return { ok: true, motivo: "outro_aceito" };
  }
  const re = REGEX_POR_CONSELHO[tipo];
  if (!re) {
    return { ok: false, motivo: "conselho_desconhecido" };
  }
  if (!re.test(String(registro_conselho).trim())) {
    return { ok: false, motivo: "regex_invalido" };
  }
  return { ok: true, motivo: "regex_ok" };
}

/**
 * Hook de extensao: quando o conselho passar a expor API oficial, plugar aqui.
 * Mantido separado para que `validate` continue puro/sincrono.
 *
 * @param {string} tipo_registro
 * @param {string} registro_conselho
 * @returns {Promise<{ok: boolean, motivo: string, detalle?: any}>}
 */
async function verifyWithCouncil(tipo_registro, registro_conselho) {
  // A validacao ESTRUTURAL decide o selo do perfil. A consulta ao conselho
  // so ENRIQUECE o resultado — ela nunca rebaixa um registro de "Verificado"
  // para "Em analise". Sem isso, configurar CRM_VERIFICATION_URL derrubaria
  // o selo de todo mundo que hoje tem cadastro valido.
  const estrutural = validate(tipo_registro, registro_conselho);
  if (!estrutural.ok) return estrutural;

  // Os adapters sao best-effort: devolvem { encontrado, motivo } em vez de
  // lancar. O try/catch aqui e so uma rede extra de seguranca.
  let conselho;
  try {
    conselho = await verificarRegistro(tipo_registro, registro_conselho);
  } catch (err) {
    conselho = { encontrado: false, motivo: `erro: ${err?.message || "desconhecido"}` };
  }

  return {
    ok: true,
    motivo: conselho.encontrado ? "conselho_confirmado" : "regex_ok",
    detalhe: conselho
  };
}

export {
  REGEX_POR_CONSELHO,
  normalize,
  validate,
  verifyWithCouncil
};
