/**
 * services/protocolos.js
 *
 * Sistema de Protocolos de Pagamento — escrow (custódia) para marketplace.
 *
 * Fluxo:
 *   1. PCP (Protocolo de Custódia de Plantão) — criado quando contratante
 *      aceita uma candidatura. Vaga sai do Quadro de Vagas Ativas.
 *      Status inicial: 'pendente' → 'enviado' (ao profissional)
 *
 *   2. PCM (Protocolo de Confirmação de Matching Vaga × Profissional) —
 *      enviado ao profissional para confirmar o matching. Pode:
 *      - aceitar → status 'aceito' → gera PDC automaticamente
 *      - recusar → status 'recusado' → reabre a candidatura e a vaga
 *
 *   3. PDC (Protocolo de Débito de Custódia) — gerado quando profissional
 *      aceita PCM. Contratante paga valor integral (plantão + taxa).
 *      - pago → status 'pago' → 'em_custodia' (dinheiro retido)
 *      - Profissional recebe confirmação + garantia de pagamento
 *
 *   4. Checkout bidirecional:
 *      - Profissional confirma execução → status 'checkout_profissional'
 *      - Contratante confirma execução → status 'checkout_contratante'
 *      - Ambos confirmam → status 'checkout_completo'
 *      - Avaliação opcional em ambos os checkouts (nota 1-5 + comentário)
 *      - A nota do contratante é gravada também em `avaliacoes`, que é a
 *        fonte de reputação lida pelo motor de matching
 *
 *   5. Check-in (chegada ao plantão):
 *      - Só existe a partir da custódia ativa (status 'checkout_pendente')
 *      - Profissional registra a chegada (timestamp + geo opcional)
 *      - Contratante pode confirmar a presença depois do check-in do profissional
 *      - O check-in é um ledger à parte (`protocolo_checkins`), independente
 *        do `status` do protocolo
 *      - O check-out do profissional pressupõe check-in; protocolos
 *        anteriores à feature recebem um check-in implícito
 *
 *   6. Liberação de pagamento ao profissional:
 *      - Após checkout_completo, pagamento é liberado em até 72h
 *      - Cron job processa liberação automática (services/protocolos-cleanup.js)
 *      - Em modo live, chama Stripe transfer para a conta Connect do profissional
 *      - Status final: 'liberado'
 *
 * Estados possíveis:
 *   pendente → enviado → aceito → pago → em_custodia → checkout_pendente →
 *   checkout_profissional | checkout_contratante → checkout_completo → liberado
 *
 *   pendente → enviado → recusado → cancelado (reabre vaga)
 *   pago → reembolsado (se contratante cancelar antes do checkout)
 *   pendente | enviado → expirado (só estados pré-pagamento: expirar um
 *                       protocolo já pago destruiria a custódia)
 */
import db from '../db/driver.js';
import { emitirParaUsuario, logarTransicaoProtocolo } from './event-bus.js';
import { notifyUser } from './push.js';
import { notifyNetlify } from './netlify.js';
import { iniciarPPP } from './protocolos-ppp-pnp.js';

const PLATFORM_FEE_PCT = Number(process.env.PLATFORM_FEE_PCT || 10);  // 10% taxa
const PRAZO_PCM_HORAS = Number(process.env.PRAZO_PCM_HORAS || 48);    // 48h para prof aceitar
const PRAZO_PDC_HORAS = Number(process.env.PRAZO_PDC_HORAS || 72);    // 72h para contratante pagar
const PRAZO_LIBERACAO_HORAS = Number(process.env.PRAZO_LIBERACAO_HORAS || 72);  // 72h após checkout

/**
 * Cria um PCP (Protocolo de Custódia de Plantão) e envia PCM ao profissional.
 *
 * Chamado quando o contratante ACEITA uma candidatura em
 * PATCH /api/candidaturas/:id com status_candidatura='aceita'.
 *
 * @param {Object} dados - { candidatura_id, vaga_id, contratante_id, profissional_id,
 *                          remuneracao_valor_reais, remuneracao_tipo }
 * @returns {Promise<Object>} { pcp, pcm } — protocolos criados
 */
export async function criarPCP(dados) {
  const { candidatura_id, vaga_id, contratante_id, profissional_id, remuneracao_valor_reais, remuneracao_tipo } = dados;

  // Calcula valores em centavos
  const valorPlantaoCentavos = Math.round(Number(remuneracao_valor_reais) * 100);
  const valorTaxaCentavos = Math.max(
    Math.round(valorPlantaoCentavos * PLATFORM_FEE_PCT / 100),
    100  // Mínimo R$ 1,00
  );
  const valorTotalCentavos = valorPlantaoCentavos + valorTaxaCentavos;

  // Prazo para profissional aceitar o PCM (48h)
  const expiraEm = new Date(Date.now() + PRAZO_PCM_HORAS * 60 * 60 * 1000).toISOString();

  // Cria PCP (status: pendente — ainda não enviado ao profissional)
  const pcpInfo = await db.run(
    `INSERT INTO protocolos
      (tipo, id_vaga, id_candidatura, id_contratante, id_profissional,
       status, valor_plantao_centavos, valor_taxa_centavos, valor_total_centavos,
       expira_em, prazo_liberacao_horas)
     VALUES ('PCP', ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)`,
    [vaga_id, candidatura_id, contratante_id, profissional_id,
     valorPlantaoCentavos, valorTaxaCentavos, valorTotalCentavos,
     expiraEm, PRAZO_LIBERACAO_HORAS]
  );
  const pcpId = pcpInfo.lastInsertRowid;

  // Atualiza para 'enviado' e marca enviado_em
  await db.run(
    `UPDATE protocolos SET status = 'enviado', enviado_em = datetime('now') WHERE id = ?`,
    [pcpId]
  );

  // Log de auditoria
  await logarTransicaoProtocolo(pcpId, null, 'enviado', contratante_id, 'PCP criado e enviado ao profissional');

  // Cria PCM (enviado ao profissional para aceitar/recusar)
  const pcmInfo = await db.run(
    `INSERT INTO protocolos
      (tipo, id_vaga, id_candidatura, id_contratante, id_profissional,
       status, valor_plantao_centavos, valor_taxa_centavos, valor_total_centavos,
       expira_em, prazo_liberacao_horas)
     VALUES ('PCM', ?, ?, ?, ?, 'enviado', ?, ?, ?, ?, ?)`,
    [vaga_id, candidatura_id, contratante_id, profissional_id,
     valorPlantaoCentavos, valorTaxaCentavos, valorTotalCentavos,
     expiraEm, PRAZO_LIBERACAO_HORAS]
  );
  const pcmId = pcmInfo.lastInsertRowid;

  // Log de auditoria
  await logarTransicaoProtocolo(pcmId, null, 'enviado', contratante_id, 'PCM criado e enviado ao profissional');

  // Emite evento Socket.IO para o profissional + Web Push
  const payload = {
    pcp_id: pcpId,
    pcm_id: pcmId,
    vaga_id,
    candidatura_id,
    contratante_id,
    valor_plantao_centavos: valorPlantaoCentavos,
    valor_taxa_centavos: valorTaxaCentavos,
    valor_total_centavos: valorTotalCentavos,
    expira_em: expiraEm
  };
  emitirParaUsuario(profissional_id, 'protocolo:pcm_recebido', payload);
  notifyUser(profissional_id, {
    title: '🎯 Matching confirmado — confirme o plantão',
    body: `Você foi selecionado! Valor: R$ ${(valorPlantaoCentavos/100).toFixed(2)} (garantido via custódia). Confirme em até ${PRAZO_PCM_HORAS}h.`,
    data: { url: '/dashboard/profissional', protocolo_id: pcmId }
  }).catch(() => {});

  notifyNetlify('pcm_enviado', {
    pcm_id: pcmId, pcp_id: pcpId, vaga_id, profissional_id, contratante_id
  }).catch(e => console.warn('[webhook]', e.message));

  const pcp = await db.get('SELECT * FROM protocolos WHERE id = ?', [pcpId]);
  const pcm = await db.get('SELECT * FROM protocolos WHERE id = ?', [pcmId]);

  return { pcp, pcm };
}

/**
 * Profissional ACEITA o PCM — gera PDC automaticamente.
 *
 * @param {number} pcm_id
 * @param {number} profissional_id (deve ser o profissional do PCM)
 * @returns {Promise<Object>} { pdc } — protocolo PDC criado
 */
export async function aceitarPCM(pcm_id, profissional_id) {
  const pcm = await db.get('SELECT * FROM protocolos WHERE id = ? AND tipo = ?', [pcm_id, 'PCM']);
  if (!pcm) throw new Error('PCM não encontrado');
  if (pcm.id_profissional !== profissional_id) throw new Error('Não autorizado');
  if (pcm.status !== 'enviado') throw new Error(`PCM não pode ser aceito (status atual: ${pcm.status})`);

  // Verifica expiração
  if (pcm.expira_em && new Date(pcm.expira_em) < new Date()) {
    await db.run("UPDATE protocolos SET status = 'expirado' WHERE id = ?", [pcm_id]);
    await logarTransicaoProtocolo(pcm_id, pcm.status, 'expirado', profissional_id, 'PCM expirado');
    throw new Error('PCM expirado');
  }

  // Atualiza PCM para 'aceito'
  await db.run(
    `UPDATE protocolos SET status = 'aceito', respondido_em = datetime('now') WHERE id = ?`,
    [pcm_id]
  );
  await logarTransicaoProtocolo(pcm_id, 'enviado', 'aceito', profissional_id, 'PCM aceito pelo profissional');

  // Atualiza PCP para 'aceito' (link pelo mesmo vaga + candidatura + contratante + profissional)
  const pcp = await db.get(
    `SELECT * FROM protocolos WHERE tipo = 'PCP' AND id_vaga = ? AND id_candidatura = ? AND id_contratante = ? AND id_profissional = ?`,
    [pcm.id_vaga, pcm.id_candidatura, pcm.id_contratante, pcm.id_profissional]
  );
  if (pcp) {
    await db.run(
      `UPDATE protocolos SET status = 'aceito', respondido_em = datetime('now') WHERE id = ?`,
      [pcp.id]
    );
    await logarTransicaoProtocolo(pcp.id, pcp.status, 'aceito', profissional_id, 'PCP confirmado pelo profissional');
  }

  // Gera PDC (Protocolo de Débito de Custódia)
  const expiraPdc = new Date(Date.now() + PRAZO_PDC_HORAS * 60 * 60 * 1000).toISOString();
  const pdcInfo = await db.run(
    `INSERT INTO protocolos
      (tipo, id_vaga, id_candidatura, id_contratante, id_profissional,
       status, valor_plantao_centavos, valor_taxa_centavos, valor_total_centavos,
       enviado_em, expira_em, prazo_liberacao_horas)
     VALUES ('PDC', ?, ?, ?, ?, 'enviado', ?, ?, ?, datetime('now'), ?, ?)`,
    [pcm.id_vaga, pcm.id_candidatura, pcm.id_contratante, pcm.id_profissional,
     pcm.valor_plantao_centavos, pcm.valor_taxa_centavos, pcm.valor_total_centavos,
     expiraPdc, PRAZO_LIBERACAO_HORAS]
  );
  const pdcId = pdcInfo.lastInsertRowid;
  await logarTransicaoProtocolo(pdcId, null, 'enviado', profissional_id, 'PDC gerado após aceitação do PCM');

  // Cria registro de pagamento em custódia pendente
  await db.run(
    `INSERT INTO pagamentos_custodia (id_protocolo, valor_centavos, status)
     VALUES (?, ?, 'pendente')`,
    [pdcId, pcm.valor_total_centavos]
  );

  // Notifica contratante: profissional aceitou, faça o pagamento
  emitirParaUsuario(pcm.id_contratante, 'protocolo:pdc_gerado', {
    pdc_id: pdcId,
    pcm_id,
    vaga_id: pcm.id_vaga,
    profissional_id,
    valor_total_centavos: pcm.valor_total_centavos,
    expira_em: expiraPdc
  });
  notifyUser(pcm.id_contratante, {
    title: '✓ Profissional aceitou! Faça o pagamento da custódia',
    body: `R$ ${(pcm.valor_total_centavos/100).toFixed(2)} (plantão + taxa). Pague em até ${PRAZO_PDC_HORAS}h para garantir o plantão.`,
    data: { url: '/dashboard/contratante', protocolo_id: pdcId }
  }).catch(() => {});

  notifyNetlify('pdc_gerado', {
    pdc_id: pdcId, pcm_id, vaga_id: pcm.id_vaga, contratante_id: pcm.id_contratante
  }).catch(e => console.warn('[webhook]', e.message));

  return await db.get('SELECT * FROM protocolos WHERE id = ?', [pdcId]);
}

/**
 * Profissional RECUSA o PCM — reabre a candidatura e a vaga.
 *
 * @param {number} pcm_id
 * @param {number} profissional_id
 * @param {string} motivo
 */
export async function recusarPCM(pcm_id, profissional_id, motivo = null) {
  const pcm = await db.get('SELECT * FROM protocolos WHERE id = ? AND tipo = ?', [pcm_id, 'PCM']);
  if (!pcm) throw new Error('PCM não encontrado');
  if (pcm.id_profissional !== profissional_id) throw new Error('Não autorizado');
  if (pcm.status !== 'enviado') throw new Error(`PCM não pode ser recusado (status: ${pcm.status})`);

  // Atualiza PCM e PCP para 'recusado'
  await db.run(
    `UPDATE protocolos SET status = 'recusado', respondido_em = datetime('now'), motivo_rejeicao = ? WHERE id = ?`,
    [motivo, pcm_id]
  );
  await logarTransicaoProtocolo(pcm_id, 'enviado', 'recusado', profissional_id, motivo || 'Recusado pelo profissional');

  // Atualiza PCP
  const pcp = await db.get(
    `SELECT * FROM protocolos WHERE tipo = 'PCP' AND id_vaga = ? AND id_candidatura = ? AND id_profissional = ?`,
    [pcm.id_vaga, pcm.id_candidatura, pcm.id_profissional]
  );
  if (pcp) {
    await db.run(
      `UPDATE protocolos SET status = 'recusado', respondido_em = datetime('now'), motivo_rejeicao = ? WHERE id = ?`,
      [motivo, pcp.id]
    );
    await logarTransicaoProtocolo(pcp.id, pcp.status, 'recusado', profissional_id, motivo || 'PCP recusado');
  }

  // Reabre a vaga (de 'fechada' para 'ativa') — M7 auto-close é desfeito
  await db.run(
    `UPDATE vagas SET status = 'ativa' WHERE id = ? AND status = 'fechada'`,
    [pcm.id_vaga]
  );

  // Reabre a candidatura para 'recusada' (matching não aconteceu)
  await db.run(
    `UPDATE candidaturas SET status_candidatura = 'recusada' WHERE id = ?`,
    [pcm.id_candidatura]
  );

  // Notifica contratante
  emitirParaUsuario(pcm.id_contratante, 'protocolo:pcm_recusado', {
    pcm_id, pcp_id: pcp?.id, vaga_id: pcm.id_vaga, motivo
  });
  notifyUser(pcm.id_contratante, {
    title: '✗ Profissional recusou o matching',
    body: motivo ? motivo.slice(0, 100) : 'Profissional não aceitou o plantão. Vaga reaberta.',
    data: { url: '/dashboard/contratante' }
  }).catch(() => {});

  return { ok: true, vaga_reaberta: true };
}

/**
 * Contratante paga o PDC — registra pagamento em custódia (escrow).
 *
 * Em modo mock: simula pagamento imediato (status 'em_custodia').
 * Em modo live: integra com Stripe Connect (split 90/10 entre profissional e plataforma).
 *
 * @param {number} pdc_id
 * @param {number} contratante_id
 * @returns {Promise<Object>} { protocolo, pagamento, garantido }
 */
export async function pagarPDC(pdc_id, contratante_id) {
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ? AND tipo = ?', [pdc_id, 'PDC']);
  if (!pdc) throw new Error('PDC não encontrado');
  // contratante_id === null = chamada interna do sistema (webhook MP)
  if (contratante_id !== null && pdc.id_contratante !== contratante_id) throw new Error('Não autorizado');
  if (pdc.status !== 'enviado') throw new Error(`PDC não pode ser pago (status: ${pdc.status})`);

  // Verifica expiração
  if (pdc.expira_em && new Date(pdc.expira_em) < new Date()) {
    await db.run("UPDATE protocolos SET status = 'expirado' WHERE id = ?", [pdc_id]);
    await logarTransicaoProtocolo(pdc_id, pdc.status, 'expirado', contratante_id, 'PDC expirado');
    throw new Error('PDC expirado');
  }

  // Atualiza PDC para 'pago' → 'em_custodia'
  await db.run(
    `UPDATE protocolos SET status = 'em_custodia', pago_em = datetime('now') WHERE id = ?`,
    [pdc_id]
  );
  await logarTransicaoProtocolo(pdc_id, 'enviado', 'pago', contratante_id, 'Pagamento em custódia');
  await logarTransicaoProtocolo(pdc_id, 'pago', 'em_custodia', contratante_id, 'Custódia confirmada');

  // Atualiza pagamento_custodia
  const pag = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [pdc_id]);
  if (pag) {
    await db.run(
      `UPDATE pagamentos_custodia SET status = 'em_custodia', pago_em = datetime('now') WHERE id = ?`,
      [pag.id]
    );
  }

  // Muda status do PCP/PCM para 'em_custodia' (também — eles compartilham o estado)
  await db.run(
    `UPDATE protocolos SET status = 'em_custodia', pago_em = datetime('now')
      WHERE tipo IN ('PCP', 'PCM')
        AND id_vaga = ? AND id_candidatura = ? AND id_contratante = ? AND id_profissional = ?`,
    [pdc.id_vaga, pdc.id_candidatura, pdc.id_contratante, pdc.id_profissional]
  );

  // Muda status para 'checkout_pendente' (próxima etapa: check-in + check-out)
  //
  // `expira_em = NULL`: o prazo de expiração é o prazo de RESPOSTA (o
  // contratante pagar, o profissional aceitar). Depois que o dinheiro está
  // em custódia, o protocolo não pode mais expirar — expirar destruiria a
  // custódia e o profissional ficaria sem receber. A partir daqui quem
  // governa o prazo é a CGPP (liberação em até 72h após o checkout).
  await db.run(
    `UPDATE protocolos SET status = 'checkout_pendente', expira_em = NULL
      WHERE id = ? OR (tipo IN ('PCP', 'PCM') AND id_vaga = ? AND id_candidatura = ? AND id_contratante = ? AND id_profissional = ?)`,
    [pdc_id, pdc.id_vaga, pdc.id_candidatura, pdc.id_contratante, pdc.id_profissional]
  );
  await logarTransicaoProtocolo(pdc_id, 'em_custodia', 'checkout_pendente', contratante_id, 'Aguardando check-in e checkout');

  // Notifica profissional: pagto garantido + TODAS as informações do plantão
  // APENAS após confirmação do Pix — antes disso, profissional não tem detalhes
  const vaga = await db.get('SELECT * FROM vagas WHERE id = ?', [pdc.id_vaga]);
  emitirParaUsuario(pdc.id_profissional, 'protocolo:custodia_confirmada', {
    pdc_id, vaga_id: pdc.id_vaga, valor_plantao_centavos: pdc.valor_plantao_centavos,
    valor_taxa_centavos: pdc.valor_taxa_centavos, valor_total_centavos: pdc.valor_total_centavos,
    garantido: true,
    // Informações do plantão — liberadas APENAS após Pix confirmado
    detalhes_plantao: {
      paciente_sexo: vaga?.paciente_sexo,
      paciente_idade: vaga?.paciente_idade,
      paciente_diagnostico: vaga?.paciente_diagnostico,
      servico_descricao: vaga?.servico_descricao,
      cidade: vaga?.cidade,
      carga_horaria: vaga?.carga_horaria,
      jornada_horario: vaga?.jornada_horario,
      jornada_escala: vaga?.jornada_escala,
      regiao: vaga?.regiao
    }
  });
  notifyUser(pdc.id_profissional, {
    title: '✅ Pagamento garantido! Execute o plantão',
    body: `R$ ${(pdc.valor_plantao_centavos/100).toFixed(2)} em custódia. Plantão: ${vaga?.cidade || ''} — ${vaga?.carga_horaria || vaga?.jornada_horario || ''}. Após o plantão, faça o checkout.`,
    data: { url: '/dashboard/profissional', protocolo_id: pdc_id }
  }).catch(() => {});

  notifyNetlify('pdc_pago', {
    pdc_id, vaga_id: pdc.id_vaga, contratante_id, profissional_id: pdc.id_profissional,
    valor_centavos: pdc.valor_total_centavos
  }).catch(e => console.warn('[webhook]', e.message));

  const protocolo = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  const pagamento = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [pdc_id]);

  return { protocolo, pagamento, garantido: true };
}

/**
 * Espelha o timestamp de check-in no protocolo e nos irmãos do mesmo
 * plantão (PCP e PCM).
 *
 * O PCP, o PCM e o PDC são três linhas do MESMO plantão (mesma vaga, mesma
 * candidatura, mesmos participantes) — o estado já é espelhado entre elas
 * desde o pagamento. Sem espelhar o check-in, o profissional via o card do
 * PDC como "Em plantão" e o card do PCM como "Aguardando check-in" para o
 * mesmo plantão.
 *
 * @param {Object} pdc — linha do protocolo
 * @param {'profissional'|'contratante'} tipo_user
 */
async function espelharCheckin(pdc, tipo_user) {
  const coluna = tipo_user === 'profissional' ? 'checkin_profissional_em' : 'checkin_contratante_em';
  await db.run(
    `UPDATE protocolos SET ${coluna} = datetime('now')
      WHERE id = ? OR (tipo IN ('PCP', 'PCM')
        AND id_vaga = ? AND id_candidatura = ?
        AND id_contratante = ? AND id_profissional = ?)`,
    [pdc.id, pdc.id_vaga, pdc.id_candidatura, pdc.id_contratante, pdc.id_profissional]
  );
}

/**
 * Registra o CHECK-IN de uma parte no protocolo.
 *
 * O check-in marca a chegada ao plantão (início do turno) e é o que dá
 * prova de presença. O check-out (conclusão) continua no fluxo de
 * `fazerCheckout()`.
 *
 * Regras:
 *   - Só faz sentido com o dinheiro em custódia (status 'checkout_pendente'):
 *     o profissional só conhece os detalhes do plantão depois do pagamento,
 *     então o check-in vem depois.
 *   - O contratante só confirma presença depois que o profissional registrou
 *     a chegada dele.
 *   - É idempotente: repetir o check-in devolve o registro existente em vez
 *     de erro (mobile com rede instável não pode travar o fluxo).
 *
 * @param {number} pdc_id
 * @param {Object} dados - { user_id, tipo_user, latitude?, longitude?, observacao? }
 * @returns {Promise<Object>} { checkin, ja_feito, protocolo }
 */
export async function fazerCheckin(pdc_id, dados) {
  const { user_id, tipo_user, latitude, longitude, observacao } = dados;
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) throw new Error('Protocolo não encontrado');

  // Verifica autorização
  if (tipo_user === 'profissional' && pdc.id_profissional !== user_id) throw new Error('Não autorizado');
  if (tipo_user === 'contratante' && pdc.id_contratante !== user_id) throw new Error('Não autorizado');

  // O check-in só existe a partir da custódia ativa.
  if (pdc.status !== 'checkout_pendente') {
    throw new Error(`Check-in não é possível neste status: ${pdc.status}`);
  }

  // O contratante confirma presença depois que o profissional chegou.
  if (tipo_user === 'contratante' && !pdc.checkin_profissional_em) {
    throw new Error('O profissional ainda não registrou o check-in.');
  }

  // Idempotência: um check-in por parte.
  const existente = await db.get(
    'SELECT * FROM protocolo_checkins WHERE id_protocolo = ? AND tipo_user = ?',
    [pdc_id, tipo_user]
  );
  if (existente) {
    return { checkin: existente, ja_feito: true, protocolo: pdc };
  }

  // `ON CONFLICT DO NOTHING` — suportado pelo SQLite (3.24+) e pelo PG,
  // e protege contra duas requisições simultâneas do mesmo usuário.
  await db.run(
    `INSERT INTO protocolo_checkins
      (id_protocolo, id_user, tipo_user, latitude, longitude, observacao, implicito)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (id_protocolo, tipo_user) DO NOTHING`,
    [
      pdc_id, user_id, tipo_user,
      latitude ?? null, longitude ?? null, observacao || null
    ]
  );

  const checkin = await db.get(
    'SELECT * FROM protocolo_checkins WHERE id_protocolo = ? AND tipo_user = ?',
    [pdc_id, tipo_user]
  );

  // Espelha o timestamp no protocolo (mesmo padrão de checkout_*_em).
  await espelharCheckin(pdc, tipo_user);

  await logarTransicaoProtocolo(
    pdc_id, pdc.status, pdc.status, user_id,
    `Check-in ${tipo_user} registrado`
  );

  // Notifica a outra parte.
  const outroUserId = tipo_user === 'profissional' ? pdc.id_contratante : pdc.id_profissional;
  emitirParaUsuario(outroUserId, 'protocolo:checkin', {
    protocolo_id: pdc_id, vaga_id: pdc.id_vaga, tipo_user, ja_feito: false
  });
  if (tipo_user === 'profissional') {
    notifyUser(outroUserId, {
      title: '📍 Profissional chegou ao plantão',
      body: 'O check-in foi registrado. Confirme a presença quando quiser.',
      data: { url: '/dashboard/contratante', protocolo_id: pdc_id }
    }).catch(() => {});
  }

  const protocolo = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  return { checkin, ja_feito: false, protocolo };
}

/**
 * Lista os check-ins de um protocolo.
 *
 * @param {number} pdc_id
 * @returns {Promise<Object[]>}
 */
export async function listarCheckins(pdc_id) {
  return await db.all(
    `SELECT c.*, u.nome AS user_nome
       FROM protocolo_checkins c
       JOIN users u ON u.id = c.id_user
      WHERE c.id_protocolo = ?
      ORDER BY c.confirmado_em ASC`,
    [pdc_id]
  );
}

/**
 * Cria um check-in implícito para protocolos anteriores à feature.
 *
 * Protocolos que já estavam em 'checkout_pendente' quando o check-in foi
 * introduzido não têm registro de chegada. Em vez de travá-los (o
 * profissional ficaria sem poder fechar o plantão), o check-in é criado
 * retroativamente, marcado como `implicito = 1` para que a auditoria
 * mostre que a chegada não foi confirmada na hora.
 *
 * @param {number} pdc_id
 * @param {number} user_id
 * @param {string} tipo_user
 * @returns {Promise<void>}
 */
async function registrarCheckinImplicito(pdc_id, user_id, tipo_user) {
  await db.run(
    `INSERT INTO protocolo_checkins
      (id_protocolo, id_user, tipo_user, observacao, implicito)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (id_protocolo, tipo_user) DO NOTHING`,
    [
      pdc_id, user_id, tipo_user,
      'Check-in implícito — protocolo anterior à feature de check-in'
    ]
  );
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (pdc) await espelharCheckin(pdc, tipo_user);
  await logarTransicaoProtocolo(
    pdc_id, null, null, user_id,
    'Check-in implícito registrado retroativamente (protocolo anterior à feature)'
  );
}

/**
 * Profissional ou Contratante faz checkout (confirma execução do plantão).
 *
 * @param {number} pdc_id (ou PCP/PCM — qualquer protocolo do fluxo)
 * @param {Object} dados - { user_id, tipo_user ('profissional'|'contratante'), nota (1-5), comentario }
 * @returns {Promise<Object>} { protocolo, checkout_completo }
 */
export async function fazerCheckout(pdc_id, dados) {
  const { user_id, tipo_user, nota, comentario } = dados;
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) throw new Error('Protocolo não encontrado');
  if (pdc.status !== 'checkout_pendente' && pdc.status !== 'checkout_profissional' && pdc.status !== 'checkout_contratante') {
    throw new Error(`Protocolo não está aguardando checkout (status: ${pdc.status})`);
  }
  // Verifica autorização
  if (tipo_user === 'profissional' && pdc.id_profissional !== user_id) throw new Error('Não autorizado');
  if (tipo_user === 'contratante' && pdc.id_contratante !== user_id) throw new Error('Não autorizado');

  // O contratante confirma a execução depois que o profissional fechou o
  // plantão. Sem essa ordem, um checkout do contratante antes do profissional
  // deixava o protocolo em 'checkout_contratante' — estado que nenhum cron
  // processa, e o pagamento ficava retido para sempre.
  if (tipo_user === 'contratante' && pdc.status === 'checkout_pendente') {
    throw new Error('O profissional ainda não confirmou a conclusão do plantão.');
  }

  // Verifica se já fez checkout (UNIQUE constraint previne duplicação)
  const existente = await db.get(
    'SELECT id FROM protocolo_checkouts WHERE id_protocolo = ? AND tipo_user = ?',
    [pdc_id, tipo_user]
  );
  if (existente) throw new Error(`${tipo_user} já fez checkout deste protocolo`);

  // O check-out do profissional pressupõe que ele chegou: se o protocolo é
  // anterior à feature de check-in, o check-in é criado retroativamente.
  if (tipo_user === 'profissional' && !pdc.checkin_profissional_em) {
    await registrarCheckinImplicito(pdc_id, user_id, tipo_user);
  }

  // Registra checkout
  await db.run(
    `INSERT INTO protocolo_checkouts (id_protocolo, id_user, tipo_user, nota, comentario)
     VALUES (?, ?, ?, ?, ?)`,
    [pdc_id, user_id, tipo_user, nota || null, comentario || null]
  );

  // Atualiza timestamp no protocolo
  if (tipo_user === 'profissional') {
    await db.run(`UPDATE protocolos SET checkout_profissional_em = datetime('now') WHERE id = ?`, [pdc_id]);
  } else {
    await db.run(`UPDATE protocolos SET checkout_contratante_em = datetime('now') WHERE id = ?`, [pdc_id]);
  }

  // Verifica se ambos fizeram checkout
  const checkouts = await db.all(
    'SELECT tipo_user FROM protocolo_checkouts WHERE id_protocolo = ?',
    [pdc_id]
  );
  const tipos = new Set(checkouts.map(c => c.tipo_user));
  const checkoutCompleto = tipos.has('profissional') && tipos.has('contratante');

  let novoStatus;
  if (checkoutCompleto) {
    novoStatus = 'checkout_completo';
  } else if (tipo_user === 'profissional') {
    novoStatus = 'checkout_profissional';
  } else {
    novoStatus = 'checkout_contratante';
  }

  await db.run(`UPDATE protocolos SET status = ? WHERE id = ?`, [novoStatus, pdc_id]);
  await logarTransicaoProtocolo(pdc_id, pdc.status, novoStatus, user_id, `Checkout ${tipo_user} confirmado`);

  // A avaliação do contratante alimenta a reputação do profissional — e a
  // reputação é o critério (peso 0.15) que o motor de matching lê. Sem esta
  // ponte, quem faz 20 plantões bem avaliados continuava com reputação 0.
  if (tipo_user === 'contratante' && nota) {
    await registrarAvaliacao(pdc, user_id, nota, comentario);
  }

  // Notifica a outra parte
  const outroUserId = tipo_user === 'profissional' ? pdc.id_contratante : pdc.id_profissional;
  const outroTipo = tipo_user === 'profissional' ? 'contratante' : 'profissional';
  emitirParaUsuario(outroUserId, `protocolo:checkout_${tipo_user}`, {
    protocolo_id: pdc_id, vaga_id: pdc.id_vaga, completo: checkoutCompleto
  });

  if (checkoutCompleto) {
    // Ambos confirmaram — dispara liberação automática (em até 72h)
    notifyUser(outroUserId, {
      title: '✓ Checkout completo! Pagamento será liberado',
      body: `R$ ${(pdc.valor_plantao_centavos/100).toFixed(2)} será liberado ao profissional em até ${pdc.prazo_liberacao_horas || PRAZO_LIBERACAO_HORAS}h.`,
      data: { url: outroTipo === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante' }
    }).catch(() => {});

    notifyNetlify('checkout_completo', {
      protocolo_id: pdc_id, vaga_id: pdc.id_vaga, valor_centavos: pdc.valor_plantao_centavos
    }).catch(e => console.warn('[webhook]', e.message));
  } else {
    // Profissional confirmou mas contratante ainda não → inicia PPP
    if (tipo_user === 'profissional') {
      // Inicia Protocolo Pós-Plantão: 1ª notificação ao contratante
      iniciarPPP(pdc_id).catch(e => console.warn('[PPP]', e.message));
    }

    notifyUser(outroUserId, {
      title: `⚠️ ${tipo_user === 'profissional' ? 'Profissional' : 'Contratante'} fez checkout`,
      body: 'Aguardando seu checkout também para liberar o pagamento.',
      data: { url: outroTipo === 'profissional' ? '/dashboard/profissional' : '/dashboard/contratante' }
    }).catch(() => {});
  }

  const protocolo = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  return { protocolo, checkout_completo: checkoutCompleto };
}

/**
 * Grava (ou atualiza) a avaliação do contratante sobre o profissional.
 *
 * A tabela `avaliacoes` é a fonte da reputação lida pelo motor de matching
 * (`media` e `total` em `recomendarParaVaga`). O checkout do protocolo
 * gravava a nota só em `protocolo_checkouts` — ou seja, a nota existia mas
 * nunca chegava ao matching.
 *
 * O UNIQUE(id_contratante, id_vaga) garante uma avaliação por vaga; um
 * segundo checkout (não deveria acontecer, mas pode) atualiza a existente.
 *
 * @param {Object} pdc — protocolo
 * @param {number} contratante_id
 * @param {number} nota — 1..5
 * @param {string} comentario
 * @returns {Promise<void>}
 */
async function registrarAvaliacao(pdc, contratante_id, nota, comentario) {
  const existente = await db.get(
    'SELECT id FROM avaliacoes WHERE id_contratante = ? AND id_vaga = ?',
    [contratante_id, pdc.id_vaga]
  );
  if (existente) {
    await db.run(
      `UPDATE avaliacoes SET nota = ?, comentario = ? WHERE id = ?`,
      [nota, comentario || null, existente.id]
    );
    return;
  }
  await db.run(
    `INSERT INTO avaliacoes (id_contratante, id_profissional, id_vaga, nota, comentario)
     VALUES (?, ?, ?, ?, ?)`,
    [contratante_id, pdc.id_profissional, pdc.id_vaga, nota, comentario || null]
  );
}

/**
 * Detecta por qual trilha (rail) o dinheiro do protocolo foi cobrado.
 *
 *   - 'stripe'      → PaymentIntent do Stripe (prefixo `pi_`). A liberação
 *                     para o profissional é um Transfer do Stripe Connect.
 *   - 'mercadopago' → cobrança Pix do Mercado Pago. O MP não tem conta
 *                     destino por profissional configurada aqui, então a
 *                     liberação é de bookkeeping: o payout ao profissional
 *                     sai pela agenda de payouts do MP da conta da
 *                     plataforma, não por uma chamada nossa.
 *   - 'desconhecida'→ sem referência de pagamento (fluxo manual/teste).
 *
 * @param {string|null} pagamentoId
 * @returns {'stripe'|'mercadopago'|'desconhecida'}
 */
export function detectarRail(pagamentoId) {
  if (!pagamentoId) return 'desconhecida';
  const id = String(pagamentoId);
  if (id.startsWith('pi_') || id.startsWith('tr_')) return 'stripe';
  if (id.startsWith('mock_pay_') || /^\d+$/.test(id)) return 'mercadopago';
  return 'desconhecida';
}

/**
 * Inicia o pagamento da custódia de um PDC.
 *
 * Ponto único de cobrança do sistema de custódia. Tanto o
 * `POST /api/protocolos/:id/pagar` quanto o `POST /api/pagamentos` (usado
 * pelo modal de pagamento do dashboard) passam por aqui — ter dois caminhos
 * de pagamento era o que permitia o dinheiro entrar por fora da custódia:
 * um pagamento criado fora do protocolo não ativava check-in/check-out e
 * nunca era liberado.
 *
 * Em modo mock (sem credenciais do Mercado Pago) o pagamento é confirmado
 * na hora. Em modo live, cria a cobrança Pix e devolve o QR code; a
 * confirmação acontece pelo webhook (ou por `confirmar-pix`).
 *
 * @param {number} pdc_id
 * @param {number} contratante_id
 * @returns {Promise<Object>}
 */
export async function iniciarPagamentoCustodia(pdc_id, contratante_id) {
  const { criarCobrancaPix, isMock: mpIsMock } = await import('./mercadopago.js');

  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ? AND tipo = ?', [pdc_id, 'PDC']);
  if (!pdc) throw new Error('PDC não encontrado');
  if (contratante_id !== null && pdc.id_contratante !== contratante_id) throw new Error('Não autorizado');
  if (pdc.status !== 'enviado') throw new Error(`PDC não pode ser pago (status: ${pdc.status})`);

  if (mpIsMock) {
    const result = await pagarPDC(pdc_id, contratante_id);
    return {
      ...result,
      pix_flow: false,
      mensagem: 'Pagamento em custódia confirmado. Profissional notificado com garantia.'
    };
  }

  // Live: cria a cobrança Pix e devolve o QR code — ainda não é custódia.
  const user = await db.get('SELECT email FROM users WHERE id = ?', [contratante_id]);
  const cobranca = await criarCobrancaPix({
    protocolo_id: pdc_id,
    valor_centavos: pdc.valor_total_centavos,
    descricao: `Custódia de Plantão #${pdc_id} — Essência do Cuidar`,
    contratante_id,
    metadata: {
      contratante_email: user?.email,
      vaga_id: pdc.id_vaga,
      profissional_id: pdc.id_profissional
    }
  });

  // Guarda o payment_id do MP na custódia (mesma coluna usada pelo Stripe).
  await db.run(
    `UPDATE pagamentos_custodia SET stripe_payment_intent_id = ? WHERE id_protocolo = ?`,
    [cobranca.payment_id, pdc_id]
  );

  return {
    pix_flow: true,
    protocolo_id: pdc_id,
    payment_id: cobranca.payment_id,
    txid: cobranca.txid,
    qr_code_base64: cobranca.qr_code_base64,
    qr_code_texto: cobranca.qr_code_texto,
    valor_total_centavos: pdc.valor_total_centavos,
    mensagem: 'Pix gerado. Após confirmação do pagamento, o sistema confirmará a custódia automaticamente.'
  };
}

/**
 * Libera pagamento ao profissional (após checkout completo + prazo de 72h).
 *
 * Em modo live: chama Stripe transfer para a conta Connect do profissional.
 * Em modo mock: simula liberação imediata.
 *
 * @param {number} pdc_id
 * @returns {Promise<Object>}
 */
export async function liberarPagamento(pdc_id) {
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) throw new Error('Protocolo não encontrado');

  // Idempotência: já liberado, não transfere nem notifica de novo.
  if (pdc.status === 'liberado') {
    return { ok: true, ja_liberado: true, valor_liberado_centavos: pdc.valor_plantao_centavos };
  }
  if (pdc.status !== 'checkout_completo') {
    throw new Error(`Protocolo não está em checkout_completo (status: ${pdc.status})`);
  }

  // ── 1. Move o dinheiro ANTES de marcar como liberado ──────────────────
  // Se a transferência falhar, o protocolo continua em 'checkout_completo'
  // e o cron tenta de novo. O inverso — marcar como liberado e depois
  // falhar a transferência — deixaria o profissional sem receber sem
  // nenhuma fila de reprocessamento.
  const pagamento = await db.get('SELECT * FROM pagamentos_custodia WHERE id_protocolo = ?', [pdc_id]);
  const rail = detectarRail(pagamento?.stripe_payment_intent_id);
  let transfer = null;

  if (rail === 'stripe') {
    try {
      const { transferirParaProfissional } = await import('./stripe.js');
      transfer = await transferirParaProfissional({
        profissional_id: pdc.id_profissional,
        valor_centavos: pdc.valor_plantao_centavos,
        protocolo_id: pdc_id
      });
      await db.run(
        `UPDATE pagamentos_custodia SET stripe_transfer_id = ? WHERE id_protocolo = ?`,
        [transfer.transfer_id, pdc_id]
      );
    } catch (err) {
      await logarTransicaoProtocolo(
        pdc_id, pdc.status, pdc.status, null,
        `Falha na transferência ao profissional: ${err.message}`
      );
      notifyUser(pdc.id_profissional, {
        title: '⚠️ Pagamento pendente de liberação',
        body: 'Conclua o cadastro de recebimento para liberar seu pagamento.',
        data: { url: '/dashboard/profissional', protocolo_id: pdc_id }
      }).catch(() => {});
      throw new Error(`Falha ao transferir o pagamento ao profissional: ${err.message}`);
    }
  }

  // ── 2. Registra a liberação ───────────────────────────────────────────
  await db.run(
    `UPDATE protocolos SET status = 'liberado', liberado_em = datetime('now') WHERE id = ?`,
    [pdc_id]
  );
  await logarTransicaoProtocolo(pdc_id, 'checkout_completo', 'liberado', null, 'Pagamento liberado ao profissional');

  // Atualiza pagamento_custodia para 'liberado_profissional'
  await db.run(
    `UPDATE pagamentos_custodia SET status = 'liberado_profissional', liberado_em = datetime('now')
      WHERE id_protocolo = ?`,
    [pdc_id]
  );

  // Atualiza PCP e PCM para 'liberado' (mesmo estado final)
  await db.run(
    `UPDATE protocolos SET status = 'liberado', liberado_em = datetime('now')
      WHERE tipo IN ('PCP', 'PCM')
        AND id_vaga = ? AND id_candidatura = ? AND id_contratante = ? AND id_profissional = ?`,
    [pdc.id_vaga, pdc.id_candidatura, pdc.id_contratante, pdc.id_profissional]
  );

  // Notifica profissional
  emitirParaUsuario(pdc.id_profissional, 'protocolo:pagamento_liberado', {
    protocolo_id: pdc_id, vaga_id: pdc.id_vaga, valor_centavos: pdc.valor_plantao_centavos,
    transfer_id: transfer?.transfer_id || null, rail
  });
  notifyUser(pdc.id_profissional, {
    title: '💰 Pagamento liberado!',
    body: `R$ ${(pdc.valor_plantao_centavos/100).toFixed(2)} liberado. Disponível em até 24-48h na sua conta Connect.`,
    data: { url: '/dashboard/profissional' }
  }).catch(() => {});

  // Notifica contratante
  emitirParaUsuario(pdc.id_contratante, 'protocolo:pagamento_liberado', {
    protocolo_id: pdc_id, vaga_id: pdc.id_vaga
  });
  notifyUser(pdc.id_contratante, {
    title: '✓ Plantão finalizado com sucesso',
    body: 'Pagamento ao profissional foi liberado. Avalie sua experiência!',
    data: { url: '/dashboard/contratante' }
  }).catch(() => {});

  notifyNetlify('pagamento_liberado', {
    protocolo_id: pdc_id, vaga_id: pdc.id_vaga,
    profissional_id: pdc.id_profissional, contratante_id: pdc.id_contratante,
    valor_centavos: pdc.valor_plantao_centavos,
    transfer_id: transfer?.transfer_id || null, rail
  }).catch(e => console.warn('[webhook]', e.message));

  return {
    ok: true,
    valor_liberado_centavos: pdc.valor_plantao_centavos,
    rail,
    transfer_id: transfer?.transfer_id || null
  };
}

/**
 * Contratante cancela PDC antes do checkout (reembolso).
 *
 * @param {number} pdc_id
 * @param {number} contratante_id
 * @param {string} motivo
 */
export async function cancelarProtocolo(pdc_id, user_id, motivo = null) {
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) throw new Error('Protocolo não encontrado');
  // Admin pode cancelar a qualquer momento; contratante só se status em_custodia
  const isAdmin = (await db.get('SELECT is_admin FROM users WHERE id = ?', [user_id]))?.is_admin;
  if (!isAdmin && pdc.id_contratante !== user_id) throw new Error('Não autorizado');
  if (!['em_custodia', 'checkout_pendente', 'checkout_profissional', 'checkout_contratante'].includes(pdc.status)) {
    throw new Error(`Protocolo não pode ser cancelado (status: ${pdc.status})`);
  }

  await db.run(
    `UPDATE protocolos SET status = 'reembolsado', motivo_rejeicao = ? WHERE id = ?`,
    [motivo, pdc_id]
  );
  await logarTransicaoProtocolo(pdc_id, pdc.status, 'reembolsado', user_id, motivo || 'Cancelado pelo contratante');

  await db.run(
    `UPDATE pagamentos_custodia SET status = 'reembolsado_contratante', liberado_em = datetime('now')
      WHERE id_protocolo = ?`,
    [pdc_id]
  );

  // Notifica ambas as partes
  emitirParaUsuario(pdc.id_profissional, 'protocolo:cancelado', { protocolo_id: pdc_id, motivo });
  emitirParaUsuario(pdc.id_contratante, 'protocolo:cancelado', { protocolo_id: pdc_id, motivo });
  notifyUser(pdc.id_profissional, {
    title: '✗ Protocolo cancelado',
    body: 'O contratante cancelou o protocolo. Valores foram reembolsados.',
    data: { url: '/dashboard/profissional' }
  }).catch(() => {});

  return { ok: true, reembolsado: true };
}

/**
 * Lista protocolos do usuário logado (como contratante OU profissional).
 */
export async function listarMeusProtocolos(user_id, filtros = {}) {
  const { tipo, status, limite = 50, offset = 0 } = filtros;
  const where = ['(p.id_contratante = ? OR p.id_profissional = ?)'];
  const params = [user_id, user_id];

  if (tipo) { where.push('p.tipo = ?'); params.push(tipo); }
  if (status) { where.push('p.status = ?'); params.push(status); }

  const rows = await db.all(
    `SELECT p.*,
            v.profissional_desejado AS vaga_titulo,
            v.servico_descricao AS vaga_descricao,
            v.regiao AS vaga_regiao,
            v.jornada_horario AS vaga_horario,
            c.nome AS contratante_nome,
            pr.nome AS profissional_nome,
            (SELECT COUNT(*) FROM protocolo_checkins ci
              WHERE ci.id_protocolo = p.id) AS total_checkins
       FROM protocolos p
       JOIN vagas v ON v.id = p.id_vaga
       JOIN users c ON c.id = p.id_contratante
       JOIN users pr ON pr.id = p.id_profissional
      WHERE ${where.join(' AND ')}
      ORDER BY p.criado_em DESC
      LIMIT ? OFFSET ?`,
    [...params, Number(limite), Number(offset)]
  );

  return rows;
}

/**
 * Lista checkouts de um protocolo.
 */
export async function listarCheckouts(pdc_id) {
  return await db.all(
    `SELECT c.*, u.nome AS user_nome
       FROM protocolo_checkouts c
       JOIN users u ON u.id = c.id_user
      WHERE c.id_protocolo = ?
      ORDER BY c.confirmado_em ASC`,
    [pdc_id]
  );
}

/**
 * Lista histórico de transições de status do protocolo (auditoria).
 */
export async function listarHistoricoStatus(pdc_id) {
  return await db.all(
    `SELECT l.*, u.nome AS alterado_por_nome
       FROM protocolo_status_log l
       LEFT JOIN users u ON u.id = l.alterado_por
      WHERE l.id_protocolo = ?
      ORDER BY l.criado_em ASC`,
    [pdc_id]
  );
}

/**
 * Busca protocolos em 'checkout_completo' há mais de 72h que ainda não foram liberados.
 * Usado pelo cron job de liberação automática.
 */
export async function buscarProtocolosParaLiberar() {
  const prazoHoras = PRAZO_LIBERACAO_HORAS;
  return await db.all(
    `SELECT * FROM protocolos
      WHERE status = 'checkout_completo'
        AND checkout_contratante_em < datetime('now', ?)
      ORDER BY checkout_contratante_em ASC
      LIMIT 100`,
    [`-${prazoHoras} hours`]
  );
}

/**
 * Busca protocolos PCM/PDC expirados (prazo ultrapassado sem resposta).
 * Usado pelo cron job de expiração.
 *
 * Só estados PRÉ-pagamento entram na lista. Um protocolo com dinheiro em
 * custódia ('em_custodia', 'checkout_pendente', 'checkout_profissional',
 * 'checkout_contratante') NÃO pode expirar: o prazo de expiração é o prazo
 * de resposta (aceitar o matching / pagar), não o prazo de entrega do
 * serviço. Marcar como 'expirado' um protocolo já pago destruía a custódia
 * e deixava o profissional sem receber — o valor ficava travado num
 * protocolo morto, sem caminho para a liberação.
 */
export async function buscarProtocolosExpirados() {
  return await db.all(
    `SELECT * FROM protocolos
      WHERE status IN ('enviado', 'pendente')
        AND expira_em IS NOT NULL
        AND expira_em < datetime('now')
      LIMIT 100`
  );
}

/**
 * Stats de protocolos (para admin).
 */
export async function statsProtocolos() {
  const stats = await db.all(
    `SELECT status, COUNT(*) AS n,
            COALESCE(SUM(valor_total_centavos), 0) AS total_centavos
       FROM protocolos
       GROUP BY status`
  );
  const totalEmCustodia = await db.get(
    `SELECT COALESCE(SUM(valor_total_centavos), 0) AS total
       FROM protocolos
      WHERE status IN ('em_custodia', 'checkout_pendente',
                       'checkout_profissional', 'checkout_contratante',
                       'checkout_completo')`
  );
  const totalLiberado = await db.get(
    `SELECT COALESCE(SUM(valor_plantao_centavos), 0) AS total
       FROM protocolos
      WHERE status = 'liberado'`
  );
  return { por_status: stats, em_custodia_centavos: totalEmCustodia?.total || 0, liberado_centavos: totalLiberado?.total || 0 };
}
