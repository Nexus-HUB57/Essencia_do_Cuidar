/**
 * services/protocolos-ppp-pnp.js
 *
 * PPP — Protocolo Pós-Plantão (3 notificações + auto-confirmação)
 * PNP — Protocolo de Não Pagamento (5 critérios de recusa)
 * CGPP — Compromisso de Garantia de Pagamento de Plantão (72h)
 *
 * Fluxo PPP:
 *   1. Profissional confirma conclusão do plantão
 *   2. Sistema envia 1ª notificação ao contratante (imediatamente)
 *   3. Se contratante não responder em 24h → 2ª notificação
 *   4. Se contratante não responder em 48h → 3ª notificação + auto-confirmação
 *   5. Após auto-confirmação, sistema libera custódia (até 72h)
 *   6. Após 3ª notificação, contratante não pode mais se manifestar
 *
 * Fluxo PNP (Recusa de Pagamento):
 *   Contratante pode recusar pagamento com 5 critérios:
 *   1. Profissional não compareceu (sem aviso prévio de 6h)
 *   2. Abandono de plantão (não cumpriu horário integral)
 *   3. Irregularidade técnica durante o plantão
 *   4. Imprevisto (pagamento parcial pelas horas trabalhadas)
 *   5. Recusa do titular (qualificação/competência/perfil)
 */
import db from '../db/driver.js';
import { emitirParaUsuario, logarTransicaoProtocolo } from './event-bus.js';
import { notifyUser } from './push.js';
import { liberarPagamento } from './protocolos.js';

const PRAZO_PPP_HORAS = 48; // Contratante tem 48h para responder
const PRAZO_CGPP_HORAS = 72; // Sistema tem 72h para liberar após conclusão

/**
 * Inicia o Protocolo Pós-Plantão (PPP) quando o profissional confirma conclusão.
 * Envia a 1ª notificação ao contratante imediatamente.
 *
 * Chamado por fazerCheckout() quando tipo_user === 'profissional'.
 */
export async function iniciarPPP(pdc_id) {
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) return;

  // Registra que o PPP foi iniciado
  await db.run(
    `UPDATE protocolos SET observacoes = COALESCE(observacoes, '') || 'PPP iniciado. ' || datetime('now')
     WHERE id = ?`,
    [pdc_id]
  );

  // 1ª NOTIFICAÇÃO ao contratante (imediatamente)
  await enviarNotificacaoPPP(pdc, 1);

  // Agenda 2ª notificação (24h) e 3ª notificação (48h) via cron
  // O cron processa protocolos em 'checkout_profissional' (profissional confirmou,
  // contratante ainda não)
}

/**
 * Envia a notificação N do PPP ao contratante.
 * @param {Object} pdc - protocolo
 * @param {number} numero - 1, 2 ou 3
 */
async function enviarNotificacaoPPP(pdc, numero) {
  const mensagens = {
    1: {
      title: '📋 Plantão concluído! Confirme e avalie o profissional',
      body: `O profissional confirmou a conclusão do plantão. Você tem ${PRAZO_PPP_HORAS}h para confirmar e avaliar. Após este prazo, o sistema confirmará automaticamente.`
    },
    2: {
      title: '⚠️ Lembrete: Confirme o plantão (restam 24h)',
      body: 'O profissional já confirmou a conclusão. Confirme e avalie em até 24h, ou o sistema confirmará automaticamente.'
    },
    3: {
      title: '⏰ Última notificação: Prazo de 48h esgotado',
      body: 'O sistema confirmará automaticamente o plantão e liberará o pagamento ao profissional.'
    }
  };

  const msg = mensagens[numero];
  if (!msg) return;

  // Registra a notificação no log
  await logarTransicaoProtocolo(
    pdc.id, pdc.status, pdc.status, null,
    `PPP: ${numero}ª notificação enviada ao contratante`
  );

  // Emite evento Socket.IO
  emitirParaUsuario(pdc.id_contratante, 'protocolo:ppp_notificacao', {
    protocolo_id: pdc.id,
    vaga_id: pdc.id_vaga,
    notificacao: numero,
    prazo_horas: PRAZO_PPP_HORAS,
    mensagem: msg.body
  });

  // Web Push
  notifyUser(pdc.id_contratante, {
    title: msg.title,
    body: msg.body,
    data: { url: '/dashboard/contratante', protocolo_id: pdc.id, acao: 'checkout' }
  }).catch(() => {});
}

/**
 * Processa protocolos em 'checkout_profissional' (profissional confirmou,
 * contratante NÃO confirmou) e envia notificações PPP + auto-confirmação.
 *
 * Deve ser chamada por cron job a cada 1h.
 *
 * Lógica:
 *   - 0h após checkout_profissional → 1ª notificação (já enviada em iniciarPPP)
 *   - 24h após checkout_profissional → 2ª notificação
 *   - 48h após checkout_profissional → 3ª notificação + auto-confirmação
 *
 * @returns {Promise<Object>} { notificados: number, auto_confirmados: number }
 */
export async function processarPPP() {
  // Busca protocolos em 'checkout_profissional' (profissional confirmou, contratante não)
  const protocolos = await db.all(
    `SELECT * FROM protocolos
      WHERE status = 'checkout_profissional'
        AND checkout_profissional_em IS NOT NULL
      ORDER BY checkout_profissional_em ASC
      LIMIT 100`
  );

  let notificados = 0, autoConfirmados = 0;

  for (const pdc of protocolos) {
    const checkoutProf = new Date(pdc.checkout_profissional_em + 'Z');
    const agora = new Date();
    const horasDecorridas = (agora - checkoutProf) / (1000 * 60 * 60);

    // 2ª notificação: entre 23h e 25h após checkout profissional
    if (horasDecorridas >= 23 && horasDecorridas < 25) {
      // Verifica se já enviou a 2ª notificação
      const jaNotificou2 = await db.get(
        `SELECT id FROM protocolo_status_log
          WHERE id_protocolo = ? AND motivo LIKE '%2ª notificação%'`,
        [pdc.id]
      );
      if (!jaNotificou2) {
        await enviarNotificacaoPPP(pdc, 2);
        notificados++;
        console.log(`[PPP] 2ª notificação enviada para protocolo #${pdc.id}`);
      }
    }

    // 3ª notificação + auto-confirmação: 48h após checkout profissional
    if (horasDecorridas >= 48) {
      // Verifica se já fez auto-confirmação
      const jaAutoConfirmou = await db.get(
        `SELECT id FROM protocolo_status_log
          WHERE id_protocolo = ? AND motivo LIKE '%auto-confirmação%'`,
        [pdc.id]
      );
      if (!jaAutoConfirmou) {
        // 3ª notificação
        await enviarNotificacaoPPP(pdc, 3);

        // AUTO-CONFIRMAÇÃO: sistema confirma o plantão automaticamente
        await autoConfirmarPlantao(pdc);
        autoConfirmados++;
        console.log(`[PPP] Auto-confirmação executada para protocolo #${pdc.id}`);
      }
    }
  }

  console.log(`[PPP] Processamento: ${notificados} notificados, ${autoConfirmados} auto-confirmados`);
  return { notificados, autoConfirmados };
}

/**
 * Auto-confirma o plantão (após 48h sem resposta do contratante).
 * Registra checkout do contratante automaticamente e libera pagamento.
 */
async function autoConfirmarPlantao(pdc) {
  // Registra checkout automático do contratante
  await db.run(
    `INSERT OR IGNORE INTO protocolo_checkouts
      (id_protocolo, id_user, tipo_user, nota, comentario)
     VALUES (?, ?, 'contratante', NULL, 'Auto-confirmação do sistema (48h sem resposta do contratante)')`,
    [pdc.id, pdc.id_contratante]
  );

  // Atualiza timestamp
  await db.run(
    `UPDATE protocolos SET checkout_contratante_em = datetime('now') WHERE id = ?`,
    [pdc.id]
  );

  // Muda status para 'checkout_completo'
  await db.run(
    `UPDATE protocolos SET status = 'checkout_completo' WHERE id = ?`,
    [pdc.id]
  );
  await logarTransicaoProtocolo(
    pdc.id, 'checkout_profissional', 'checkout_completo', null,
    'Auto-confirmação do sistema: contratante não respondeu em 48h. Plantão confirmado automaticamente.'
  );

  // Notifica ambas as partes
  emitirParaUsuario(pdc.id_contratante, 'protocolo:auto_confirmado', {
    protocolo_id: pdc.id,
    vaga_id: pdc.id_vaga,
    mensagem: 'Plantão confirmado automaticamente pelo sistema (48h sem resposta). Pagamento será liberado.'
  });
  emitirParaUsuario(pdc.id_profissional, 'protocolo:auto_confirmado', {
    protocolo_id: pdc.id,
    vaga_id: pdc.id_vaga,
    mensagem: 'Plantão confirmado automaticamente. Pagamento será liberado em até 72h.'
  });

  notifyUser(pdc.id_contratante, {
    title: '⏰ Plantão auto-confirmado pelo sistema',
    body: 'Você não respondeu em 48h. O plantão foi confirmado e o pagamento será liberado ao profissional.',
    data: { url: '/dashboard/contratante' }
  }).catch(() => {});

  notifyUser(pdc.id_profissional, {
    title: '✅ Plantão confirmado! Pagamento em até 72h',
    body: 'O sistema confirmou automaticamente o plantão. Pagamento será liberado em até 72h.',
    data: { url: '/dashboard/profissional' }
  }).catch(() => {});
}

/**
 * PNP — Protocolo de Não Pagamento.
 * Contratante recusa o pagamento com um dos 5 critérios.
 *
 * Critérios:
 *   1. nao_compareceu — Profissional não compareceu (sem aviso 6h antes)
 *   2. abandono_plantao — Não cumpriu horário integral
 *   3. irregularidade — Irregularidade técnica ou recusa de atribuições
 *   4. imprevisto — Imprevisto (pagamento parcial por horas trabalhadas)
 *   5. recusa_titular — Recusa do titular (qualificação/competência/perfil)
 *
 * @param {number} pdc_id
 * @param {number} contratante_id
 * @param {Object} dados - { criterio, descricao, horas_trabalhadas (para imprevisto) }
 * @returns {Promise<Object>}
 */
export async function recusarPagamentoPNP(pdc_id, contratante_id, dados) {
  const { criterio, descricao, horas_trabalhadas } = dados;
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) throw new Error('Protocolo não encontrado');
  if (pdc.id_contratante !== contratante_id && !contratante_id) throw new Error('Não autorizado');

  const CRITERIOS_VALIDOS = [
    'nao_compareceu',    // 1
    'abandono_plantao',  // 2
    'irregularidade',    // 3
    'imprevisto',        // 4
    'recusa_titular'     // 5
  ];
  if (!CRITERIOS_VALIDOS.includes(criterio)) {
    throw new Error(`Critério inválido. Deve ser um de: ${CRITERIOS_VALIDOS.join(', ')}`);
  }

  // Só pode recusar se o profissional já fez checkout (confirmou conclusão)
  if (pdc.status !== 'checkout_profissional' && pdc.status !== 'checkout_completo' && pdc.status !== 'checkout_pendente') {
    throw new Error(`Não é possível recusar pagamento neste status: ${pdc.status}. Profissional deve ter confirmado o plantão primeiro.`);
  }

  // Registra a recusa PNP
  await db.run(
    `UPDATE protocolos SET status = 'recusado_pnp', motivo_rejeicao = ?,
      observacoes = COALESCE(observacoes, '') || 'PNP: ' || ? || ' — ' || ?
     WHERE id = ?`,
    [criterio, criterio, descricao || '', pdc_id]
  );
  await logarTransicaoProtocolo(pdc_id, pdc.status, 'recusado_pnp', contratante_id,
    `PNP: ${criterio} — ${descricao || 'Sem descrição'}`);

  // Lógica por critério:
  let resultado;
  switch (criterio) {
    case 'nao_compareceu':
      // Profissional não compareceu → reembolso TOTAL ao contratante
      resultado = await processarReembolsoTotal(pdc, criterio, descricao);
      break;

    case 'abandono_plantao':
      // Abandono de plantão → reembolso TOTAL ao contratante
      resultado = await processarReembolsoTotal(pdc, criterio, descricao);
      break;

    case 'irregularidade':
      // Irregularidade → reembolso TOTAL ao contratante (com análise admin)
      resultado = await processarReembolsoComAnalise(pdc, criterio, descricao);
      break;

    case 'imprevisto':
      // Imprevisto → pagamento PARCIAL pelas horas trabalhadas
      resultado = await processarPagamentoParcial(pdc, criterio, descricao, horas_trabalhadas);
      break;

    case 'recusa_titular':
      // Recusa do titular → reembolso TOTAL (com análise admin)
      resultado = await processarReembolsoComAnalise(pdc, criterio, descricao);
      break;
  }

  // Notifica profissional
  const mensagensProf = {
    nao_compareceu: 'Você não compareceu ao plantão. Pagamento cancelado.',
    abandono_plantao: 'Abandono de plantão detectado. Pagamento cancelado.',
    irregularidade: 'Irregularidade reportada. Caso em análise administrativa.',
    imprevisto: `Imprevisto reportado. Pagamento parcial de R$ ${(resultado.valor_parcial_centavos/100).toFixed(2)} liberado.`,
    recusa_titular: 'Recusa do titular reportada. Caso em análise administrativa.'
  };

  emitirParaUsuario(pdc.id_profissional, 'protocolo:pnp_recusado', {
    protocolo_id: pdc_id,
    criterio,
    mensagem: mensagensProf[criterio] || 'Pagamento recusado pelo contratante.'
  });
  notifyUser(pdc.id_profissional, {
    title: '⚠️ Pagamento recusado (PNP)',
    body: mensagensProf[criterio] || 'Pagamento recusado pelo contratante.',
    data: { url: '/dashboard/profissional', protocolo_id: pdc_id }
  }).catch(() => {});

  // Notifica contratante
  emitirParaUsuario(pdc.id_contratante, 'protocolo:pnp_registrado', {
    protocolo_id: pdc_id, criterio, resultado
  });

  return { ok: true, criterio, ...resultado };
}

/**
 * Reembolso TOTAL ao contratante (critérios 1, 2).
 */
async function processarReembolsoTotal(pdc, criterio, descricao) {
  await db.run(
    `UPDATE protocolos SET status = 'reembolsado' WHERE id = ?`,
    [pdc.id]
  );
  await logarTransicaoProtocolo(pdc.id, 'recusado_pnp', 'reembolsado', null,
    `Reembolso total ao contratante: ${criterio}`);

  await db.run(
    `UPDATE pagamentos_custodia SET status = 'reembolsado_contratante', liberado_em = datetime('now')
      WHERE id_protocolo = ?`,
    [pdc.id]
  );

  notifyUser(pdc.id_contratante, {
    title: '💰 Reembolso total processado',
    body: `R$ ${(pdc.valor_total_centavos/100).toFixed(2)} reembolsado. Motivo: ${criterio}.`,
    data: { url: '/dashboard/contratante' }
  }).catch(() => {});

  return { tipo: 'reembolso_total', valor_reembolsado_centavos: pdc.valor_total_centavos };
}

/**
 * Reembolso com análise administrativa (critérios 3, 5).
 * Admin precisa revisar e decidir.
 */
async function processarReembolsoComAnalise(pdc, criterio, descricao) {
  await db.run(
    `UPDATE protocolos SET status = 'em_analise_pnp' WHERE id = ?`,
    [pdc.id]
  );
  await logarTransicaoProtocolo(pdc.id, 'recusado_pnp', 'em_analise_pnp', null,
    `PNP em análise administrativa: ${criterio} — ${descricao || ''}`);

  // Notifica admin (via webhook log)
  await db.run(
    `INSERT INTO webhook_logs (tipo, payload, status_code, resposta)
     VALUES ('pnp_analise', ?, 200, ?)`,
    [
      JSON.stringify({ protocolo_id: pdc.id, criterio, descricao }),
      JSON.stringify({ status: 'aguardando_analise_admin' })
    ]
  );

  return { tipo: 'em_analise', mensagem: 'Caso enviado para análise administrativa. Admin decidirá o reembolso.' };
}

/**
 * Pagamento PARCIAL por horas trabalhadas (critério 4 — imprevisto).
 *
 * @param {Object} pdc
 * @param {string} criterio
 * @param {string} descricao
 * @param {number} horas_trabalhadas — horas efetivamente trabalhadas
 */
async function processarPagamentoParcial(pdc, criterio, descricao, horasTrabalhadas) {
  if (!horasTrabalhadas || horasTrabalhadas <= 0) {
    throw new Error('horas_trabalhadas é obrigatório para o critério "imprevisto"');
  }

  // Calcula valor proporcional
  // Se a vaga é por hora: valor_hora * horas_trabalhadas
  // Se a vaga é por plantão: valor_plantao * (horas_trabalhadas / horas_totais)
  const valorPlantao = pdc.valor_plantao_centavos;
  let valorParcialCentavos;

  // Tenta buscar a vaga para saber o tipo de remuneração
  const vaga = await db.get('SELECT remuneracao_tipo, remuneracao_valor, carga_horaria FROM vagas WHERE id = ?', [pdc.id_vaga]);

  if (vaga && vaga.remuneracao_tipo === 'hora') {
    // Pagamento por hora: simples multiplicação
    valorParcialCentavos = Math.round((vaga.remuneracao_valor * 100) * horasTrabalhadas);
  } else {
    // Pagamento por plantão: proporcional (estima 12h por plantão se não houver info)
    const horasTotais = 12; // estimativa padrão
    valorParcialCentavos = Math.round(valorPlantao * (horasTrabalhadas / horasTotais));
  }

  // Não pode exceder o valor total
  valorParcialCentavos = Math.min(valorParcialCentavos, valorPlantao);

  // Libera pagamento parcial ao profissional
  await db.run(
    `UPDATE protocolos SET status = 'liberado_parcial', liberado_em = datetime('now') WHERE id = ?`,
    [pdc.id]
  );
  await logarTransicaoProtocolo(pdc.id, 'recusado_pnp', 'liberado_parcial', null,
    `Pagamento parcial: ${horasTrabalhadas}h trabalhadas = R$ ${(valorParcialCentavos/100).toFixed(2)}`);

  // Atualiza pagamento custódia
  await db.run(
    `UPDATE pagamentos_custodia SET status = 'liberado_profissional', liberado_em = datetime('now')
      WHERE id_protocolo = ?`,
    [pdc.id]
  );

  // Reembolsa o restante ao contratante
  const valorReembolso = pdc.valor_total_centavos - valorParcialCentavos;
  if (valorReembolso > 0) {
    notifyUser(pdc.id_contratante, {
      title: '💰 Reembolso parcial processado',
      body: `R$ ${(valorReembolso/100).toFixed(2)} reembolsado. Profissional recebeu R$ ${(valorParcialCentavos/100).toFixed(2)} por ${horasTrabalhadas}h.`,
      data: { url: '/dashboard/contratante' }
    }).catch(() => {});
  }

  notifyUser(pdc.id_profissional, {
    title: '💰 Pagamento parcial liberado',
    body: `R$ ${(valorParcialCentavos/100).toFixed(2)} liberado por ${horasTrabalhadas}h trabalhadas.`,
    data: { url: '/dashboard/profissional' }
  }).catch(() => {});

  return {
    tipo: 'pagamento_parcial',
    valor_parcial_centavos: valorParcialCentavos,
    horas_trabalhadas: horasTrabalhadas,
    valor_reembolso_centavos: valorReembolso
  };
}

/**
 * Admin resolve um PNP em análise (critérios 3 e 5).
 * Pode aprovar reembolso total, reembolso parcial ou negar (liberar ao profissional).
 *
 * @param {number} pdc_id
 * @param {number} admin_id
 * @param {Object} dados - { decisao: 'reembolso_total'|'reembolso_parcial'|'liberar_profissional', valor_parcial_centavos (opcional), motivo }
 */
export async function adminResolverPNP(pdc_id, admin_id, dados) {
  const { decisao, valor_parcial_centavos, motivo } = dados;
  const pdc = await db.get('SELECT * FROM protocolos WHERE id = ?', [pdc_id]);
  if (!pdc) throw new Error('Protocolo não encontrado');
  if (pdc.status !== 'em_analise_pnp') throw new Error('Protocolo não está em análise PNP');

  switch (decisao) {
    case 'reembolso_total':
      await db.run(`UPDATE protocolos SET status = 'reembolsado' WHERE id = ?`, [pdc_id]);
      await db.run(
        `UPDATE pagamentos_custodia SET status = 'reembolsado_contratante', liberado_em = datetime('now')
          WHERE id_protocolo = ?`, [pdc_id]
      );
      await logarTransicaoProtocolo(pdc_id, 'em_analise_pnp', 'reembolsado', admin_id,
        `Admin: reembolso total — ${motivo || ''}`);
      // Notifica
      emitirParaUsuario(pdc.id_contratante, 'protocolo:pnp_resolvido', { protocolo_id: pdc_id, decisao });
      emitirParaUsuario(pdc.id_profissional, 'protocolo:pnp_resolvido', { protocolo_id: pdc_id, decisao });
      return { ok: true, decisao: 'reembolso_total' };

    case 'reembolso_parcial':
      const valorParcial = Number(valor_parcial_centavos) || 0;
      await db.run(`UPDATE protocolos SET status = 'liberado_parcial', liberado_em = datetime('now') WHERE id = ?`, [pdc_id]);
      await db.run(
        `UPDATE pagamentos_custodia SET status = 'liberado_profissional', liberado_em = datetime('now')
          WHERE id_protocolo = ?`, [pdc_id]
      );
      await logarTransicaoProtocolo(pdc_id, 'em_analise_pnp', 'liberado_parcial', admin_id,
        `Admin: reembolso parcial — R$ ${(valorParcial/100).toFixed(2)} ao prof, resto ao contratante — ${motivo || ''}`);
      emitirParaUsuario(pdc.id_contratante, 'protocolo:pnp_resolvido', { protocolo_id: pdc_id, decisao, valor_parcial_centavos: valorParcial });
      emitirParaUsuario(pdc.id_profissional, 'protocolo:pnp_resolvido', { protocolo_id: pdc_id, decisao, valor_parcial_centavos: valorParcial });
      return { ok: true, decisao: 'reembolso_parcial', valor_parcial_centavos: valorParcial };

    case 'liberar_profissional':
      await db.run(`UPDATE protocolos SET status = 'liberado', liberado_em = datetime('now') WHERE id = ?`, [pdc_id]);
      await db.run(
        `UPDATE pagamentos_custodia SET status = 'liberado_profissional', liberado_em = datetime('now')
          WHERE id_protocolo = ?`, [pdc_id]
      );
      await logarTransicaoProtocolo(pdc_id, 'em_analise_pnp', 'liberado', admin_id,
        `Admin: pagamento liberado ao profissional — ${motivo || ''}`);
      emitirParaUsuario(pdc.id_contratante, 'protocolo:pnp_resolvido', { protocolo_id: pdc_id, decisao });
      emitirParaUsuario(pdc.id_profissional, 'protocolo:pnp_resolvido', { protocolo_id: pdc_id, decisao });
      notifyUser(pdc.id_profissional, {
        title: '✅ Pagamento liberado!',
        body: `R$ ${(pdc.valor_plantao_centavos/100).toFixed(2)} liberado pelo administrador.`,
        data: { url: '/dashboard/profissional' }
      }).catch(() => {});
      return { ok: true, decisao: 'liberar_profissional' };

    default:
      throw new Error('Decisão inválida. Use: reembolso_total, reembolso_parcial ou liberar_profissional');
  }
}
