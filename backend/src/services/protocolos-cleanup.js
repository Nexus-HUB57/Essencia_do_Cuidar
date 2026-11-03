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

/**
 * Libera pagamentos de protocolos em 'checkout_completo' há mais de 72h.
 * Em modo live, chama Stripe transfer para conta Connect do profissional.
 * Em modo mock, apenas atualiza status (simulação).
 *
 * @returns {Promise<Object>} { liberados: number, erros: number }
 */
export async function liberarPagamentosApos72h() {
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
 * Job completo (chamado por cron diário):
 *   1. Expira protocolos não respondidos
 *   2. Libera pagamentos após 72h do checkout completo
 */
export async function rodarProtocolosCleanup() {
  const r1 = await expirarProtocolosNaoRespondidos();
  const r2 = await liberarPagamentosApos72h();
  return {
    expiracao: r1,
    liberacao: r2
  };
}
