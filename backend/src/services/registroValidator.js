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

/**
 * Regex por conselho. Cada entrada aceita o número COM ou SEM o prefixo do
 * conselho, e — onde há ambiguidade histórica de ordem — aceita as duas
 * variantes (o formulário de cadastro sugere "123456-SP", a documentação
 * usa "COREN-SP 123456").
 *
 * Fontes dos formatos:
 *   - COREN: UF + 4-6 digitos (ex: "COREN-SP 123456" ou "SP-123456")
 *   - CRM:   4-6 digitos + "/" + UF (ex: "123456/SP")
 *   - CREFITO: 4-6 digitos + "-" + letra (ex: "CREFITO-12345-F")
 *   - CRP:   2 digitos + "/" + 4-5 digitos (ex: "06/12345")
 *   - CRN:   4-6 digitos + "/" + UF (ex: "12345/RJ")
 */
const REGEX_POR_CONSELHO = {
  COREN: /^(?:COREN[-\s]?)?(?:([A-Z]{2})[-\s]?(\d{4,6})|(\d{4,6})[-\s]?([A-Z]{2}))$/i,
  CRM:   /^(?:CRM[-\s]?)?(\d{4,6})[\/\-\s]([A-Z]{2})$/i,
  CREFITO: /^(?:CREFITO[-\s]?)?(?:(\d{4,6})[-\s]?([A-Z])|(\d{4,6})[\/\-]([A-Z]{2})(-\d+)?)$/i,
  CRP:   /^(?:CRP[-\s]?)?(\d{2})[\/\-\s](\d{4,5})$/i,
  CRN:   /^(?:CRN[-\s]?)?(\d{4,6})[\/\-\s]([A-Z]{2})$/i
};

/** Exemplos usados nas mensagens de erro (espelham o README). */
const EXEMPLOS = {
  COREN: 'COREN-SP 123456',
  CRM: '123456/SP',
  CREFITO: 'CREFITO-12345-F',
  CRP: '06/12345',
  CRN: '12345/RJ',
  OUTRO: 'qualquer identificação'
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
    // SEM alterar o separador. A versão anterior inseria um espaço aqui e
    // transformava "COREN-SP 123456" em "COREN -SP 123456" — o que quebrava
    // o próprio regex do conselho e impedia o cadastro de um registro válido.
    return trimmed.replace(
      new RegExp(`^${tipo}(?=[-\\s]|$)`, "i"),
      tipo.toUpperCase()
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
  // Por enquanto, delega a validacao estrutural. Substituir quando houver API.
  return validate(tipo_registro, registro_conselho);
}

export {
  REGEX_POR_CONSELHO,
  EXEMPLOS,
  normalize,
  validate,
  verifyWithCouncil
};
