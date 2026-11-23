/**
 * services/protocolos-cleanup.js
 *
 * Cron jobs do sistema de protocolos:
 *   1. Liberação automática de pagamentos — após checkout_completo + 72h,
 *      chama liberarPagamento() automaticamente.
 *   2. Expiração de protocolos PCM/PDC não respondidos — marca como 'expirado'
 *      e toma ação apropriada (reabre vaga, reembolsa custódia).
 *
 * Uso via endpoint admin:
 *   POST /api/admin/protocolos/liberar-pagamentos  → dispara liberação
 *   POST /api/admin/protocolos/limpar-expirados    → dispara expiração
 *
 * Em produção: recomenda-se cron job diário (k8s CronJob, Render Cron, host crontab).
 */
import db from '../db/driver.js';
import { liberarPagamento, buscarProtocolosParaLiberar, buscarProtocolosExpirados } from './protocolos.js';
import { emitirParaUsuario, logarTransicaoProtocolo } from './event-bus.js';
import { notifyUser } from './push.js';
import { processarPPP } from './protocolos-ppp-pnp.js';

/**
 * Libera pagamentos de protocolos em 'checkout_completo' há mais de 72h.
 * Em modo live, chama Stripe transfer para conta Connect do profissional.
 * Em modo mock, apenas atualiza status (simulação).
 *
 * @returns {Promise<Object>} { liberados: number, erros: number }
 */
export async function liberarPagamentosApos72h() {
  await recuperarLiberacoesTravadas();
  const protocolos = await buscarProtocolosParaLiberar();
  let liberados = 0, erros = 0;

  for (const p of protocolos) {
    try {
      await liberarPagamento(p.id);
      liberados++;
      console.log(`[protocolos-cleanup] Pagamento liberado para protocolo #${p.id} (R$ ${(p.valor_plantao_centavos/100).toFixed(2)})`);
      // Throttle para não sobrecarregar Stripe
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      erros++;
      console.error(`[protocolos-cleanup] Falha ao liberar protocolo #${p.id}:`, err.message);
    }
  }

  console.log(`[protocolos-cleanup] Liberação: ${liberados} liberados, ${erros} erros`);
  return { liberados, erros };
}

/**
 * Recupera liberações travadas.
 *
 * `liberarPagamento()` reivindica o protocolo antes de mover o dinheiro
 * (INSERT em `protocolo_liberamento_claim`). Se o processo morre entre a
 * reivindicação e a escrita final, a linha ficaria na tabela e o protocolo
 * jamais seria liberado — o cron não o pega (só olha 'checkout_completo')
 * e o profissional nunca receberia.
 *
 * Esta rotina remove reivindicações abandonadas há mais de 10 minutos
 * para que a próxima rodada do cron reprocesse o protocolo. Na trilha
 * Stripe, o `stripe_transfer_id` já gravado (quando a transferência
 * chegou a acontecer) impede a transferência de se repetir.
 *
 * @returns {Promise<number>} quantidade de reivindicações liberadas
 */
export async function recuperarLiberacoesTravadas() {
  const MINUTOS = 10;
  const travadas = await db.all(
    `SELECT c.id_protocolo, c.token FROM protocolo_liberamento_claim c
      WHERE c.claimado_em < datetime('now', ?)
      LIMIT 100`,
    [`-${MINUTOS} minutes`]
  );

  let recuperadas = 0;
  for (const c of travadas) {
    try {
      // Verifica se o protocolo já foi liberado — nesse caso só limpa a linha.
      const p = await db.get('SELECT status FROM protocolos WHERE id = ?', [c.id_protocolo]);
      if (p && p.status !== 'liberado') {
        await db.run(
          `UPDATE protocolos SET status = 'checkout_completo'
            WHERE id = ? AND status = 'checkout_completo'`,
          [c.id_protocolo]
        );
        await logarTransicaoProtocolo(
          c.id_protocolo, 'liberando', 'checkout_completo', null,
          'Liberação abandonada — devolvida para nova tentativa'
        );
        console.warn(`[protocolos-cleanup] Protocolo #${c.id_protocolo} travado na liberação — devolvido para nova tentativa`);
      }
      await db.run(
        `DELETE FROM protocolo_liberamento_claim WHERE id_protocolo = ? AND token = ?`,
        [c.id_protocolo, c.token]
      );
      recuperadas++;
    } catch (err) {
      console.error(`[protocolos-cleanup] Falha ao recuperar liberação do protocolo #${c.id_protocolo}:`, err.message);
    }
  }
  return recuperadas;
}

/**
 * Marca protocolos PCM/PDC não respondidos como 'expirado' e toma ação:
 *   - PCM expirado → reabre vaga (igual a recusar, sem motivo do profissional)
 *   - PDC expirado (contratante não pagou) → reembolsa custódia (se já pago) + cancela matching
 *
 * @returns {Promise<Object>} { expirados: number, reabertos: number, reembolsados: number }
 */
export async function expirarProtocolosNaoRespondidos() {
  const protocolos = await buscarProtocolosExpirados();
  let expirados = 0, reabertos = 0, reembolsados = 0;

  for (const p of protocolos) {
    try {
      const statusAnterior = p.status;
      await db.run("UPDATE protocolos SET status = 'expirado' WHERE id = ?", [p.id]);
      await logarTransicaoProtocolo(p.id, statusAnterior, 'expirado', null, `Expirado automaticamente (prazo: ${p.expira_em})`);
      expirados++;

      // Se era PCM enviado (profissional não respondeu), reabre a vaga
      if (p.tipo === 'PCM' && statusAnterior === 'enviado') {
        await db.run(
          `UPDATE vagas SET status = 'ativa' WHERE id = ? AND status = 'fechada'`,
          [p.id_vaga]
        );
        reabertos++;
        emitirParaUsuario(p.id_contratante, 'protocolo:pcm_expirado', {
          protocolo_id: p.id, vaga_id: p.id_vaga
        });
        notifyUser(p.id_contratante, {
          title: '⚠️ Profissional não respondeu ao matching',
          body: 'O prazo expirou. A vaga foi reaberta — você pode aceitar outro candidato.',
          data: { url: '/dashboard/contratante' }
        }).catch(() => {});
      }

      // Se era PDC enviado (contratante não pagou), cancela + reembolsa
      if (p.tipo === 'PDC' && statusAnterior === 'enviado') {
        await db.run(
          `UPDATE pagamentos_custodia SET status = 'reembolsado_contratante', liberado_em = datetime('now')
            WHERE id_protocolo = ? AND status = 'pendente'`,
          [p.id]
        );
        reembolsados++;
        // Notifica ambas as partes
        emitirParaUsuario(p.id_contratante, 'protocolo:pdc_expirado', { protocolo_id: p.id, reembolsado: true });
        emitirParaUsuario(p.id_profissional, 'protocolo:pdc_expirado', { protocolo_id: p.id });
        notifyUser(p.id_contratante, {
          title: '⏰ PDC expirado — matching cancelado',
          body: 'Você não fez o pagamento no prazo. O matching foi cancelado.',
          data: { url: '/dashboard/contratante' }
        }).catch(() => {});
        notifyUser(p.id_profissional, {
          title: '⏰ Matching cancelado',
          body: 'O contratante não fez o pagamento no prazo. Você pode buscar outras vagas.',
          data: { url: '/dashboard/profissional' }
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`[protocolos-cleanup] Falha ao expirar protocolo #${p.id}:`, err.message);
    }
  }

  console.log(`[protocolos-cleanup] Expiração: ${expirados} expirados, ${reabertos} reabertos, ${reembolsados} reembolsados`);
  return { expirados, reabertos, reembolsados };
}

/**
 * Job completo (chamado por cron a cada 1h):
 *   1. Processa PPP (notificações 2ª/3ª + auto-confirmação após 48h)
 *   2. Expira protocolos não respondidos
 *   3. Libera pagamentos após 72h do checkout completo
 */
export async function rodarProtocolosCleanup() {
  const r0 = await processarPPP();
  const r1 = await expirarProtocolosNaoRespondidos();
  const r2 = await liberarPagamentosApos72h();
  return {
    ppp: r0,
    expiracao: r1,
    liberacao: r2
  };
}
