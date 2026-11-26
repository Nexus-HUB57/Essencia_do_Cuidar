/**
 * Orquestrador de verificação de conselhos profissionais.
 *
 * Por padrão (SEM `CONSELHOS_FORCE_FAIL=1` no env), cada adapter é
 * desenhado para falhar graciosamente: se o portal do conselho não
 * responder em 5s, ou se a API pública não existir, o adapter retorna
 * `{ encontrado: false, motivo: '...' }` e o sistema cai em
 * `verificacao_status = 'pendente'` (aguarda revisão manual pelo admin).
 *
 * Web scraping aqui é **best-effort e conservador**: 1 request por vez,
 * timeout 5s, retry 0 (one-shot). Se o portal mudar, falhamos sem
 * escalar a falha. Não dependemos de APIs pagas de terceiros.
 */
import { verificarCRM } from './crm.js';
import { verificarCOREN } from './coren.js';
import { verificarCREFITO } from './crefito.js';
import { verificarCRP } from './crp.js';
import { verificarCRN } from './crn.js';

const TIMEOUT_MS = 5000;

const ADAPTERS = {
  CRM:     verificarCRM,
  COREN:   verificarCOREN,
  CREFITO: verificarCREFITO,
  CRP:     verificarCRP,
  CRN:     verificarCRN
};

/**
 * Roda o adapter com timeout. Se passar do tempo, falha com
 * { encontrado: false, motivo: 'timeout' }.
 */
async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ encontrado: false, motivo: `timeout ${label}` }), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifica o registro de um profissional no conselho informado.
 *
 * @param {string} tipo   — sigla do conselho (CRM, COREN, CREFITO, CRP, CRN)
 * @param {string} registro — número do registro (formato livre, ex: 'CRM-SP 123456')
 * @returns {Promise<{encontrado: bool, fonte: 'auto', dados?: object, motivo?: string}>}
 */
export async function verificarRegistro(tipo, registro) {
  const adapter = ADAPTERS[String(tipo || '').toUpperCase()];
  if (!adapter) {
    return { encontrado: false, fonte: 'auto', motivo: `conselho não suportado: ${tipo}` };
  }
  // Validação: se a feature estiver desligada por flag de teste
  if (process.env.CONSELHOS_FORCE_FAIL === '1') {
    return { encontrado: false, fonte: 'auto', motivo: 'verificação desabilitada (flag)' };
  }
  try {
    return await withTimeout(adapter(String(registro || '').trim()), TIMEOUT_MS, tipo);
  } catch (err) {
    return { encontrado: false, fonte: 'auto', motivo: `erro: ${err?.message || 'desconhecido'}` };
  }
}

/**
 * Wrapper de conveniência: retorna o novo status a ser gravado em DB.
 */
export async function verificarEClassificar(tipo, registro) {
  const r = await verificarRegistro(tipo, registro);
  if (r.encontrado) {
    return { status: 'verificado_auto', fonte: 'auto', observacao: null, dados: r };
  }
  return { status: 'pendente', fonte: 'auto', observacao: r.motivo || 'sem retorno', dados: r };
}

export const CONSELHOS_SUPORTADOS = Object.keys(ADAPTERS);
