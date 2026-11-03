/**
 * services/candidatura-cleanup.js
 *
 * M9 — Job de expiração automática de candidaturas pendentes.
 *
 * Candidaturas `pendentes` ou `visualizadas` (sem decisão) por mais de
 * CANDIDATURA_EXPIRA_DIAS (default 30) são marcadas como `recusada`
 * com motivo "expirada". Cria log em candidatura_status_log para auditoria.
 *
 * Pode ser chamado via:
 *  - Cron job (Render Cron / K8s CronJob / node-cron)
 *  - POST /api/admin/candidaturas/limpar-expiradas (admin-only)
 *
 * Recomendado: rodar 1x por dia.
 */
import db from '../db/driver.js';
import { logarTransicaoCandidatura, notificarCandidaturaStatus } from './event-bus.js';

const DIAS_EXPIRACAO = Number(process.env.CANDIDATURA_EXPIRA_DIAS || 30);

/**
 * Busca candidaturas pendentes/visualizadas há mais de DIAS_EXPIRACAO
 * e marca como recusada (expirada).
 *
 * @returns {Object} { expiradas: number, notificadas: number, erro: string|null }
 */
export async function expirarCandidaturasAntigas() {
  try {
    const expiradas = await db.all(
      `SELECT c.id, c.id_vaga, c.id_profissional, c.status_candidatura, c.criado_em,
              v.id_contratante AS contratante_id
         FROM candidaturas c
         JOIN vagas v ON v.id = c.id_vaga
        WHERE c.status_candidatura IN ('pendente', 'visualizada')
          AND c.criado_em < datetime('now', ?)
        LIMIT 100`,
      [`-${DIAS_EXPIRACAO} days`]
    );

    let nexpiradas = 0;
    let nnotificadas = 0;

    for (const c of expiradas) {
      // Atualiza para recusada com motivo
      await db.run(
        "UPDATE candidaturas SET status_candidatura = 'recusada', atualizada_em = datetime('now') WHERE id = ?",
        [c.id]
      );

      // M11 — Log de auditoria
      await logarTransicaoCandidatura(
        c.id,
        c.status_candidatura,
        'recusada',
        0,  // system user (0 = automático)
        `candidatura expirada após ${DIAS_EXPIRACAO} dias sem decisão`
      );

      // W4 — Notifica o profissional
      notificarCandidaturaStatus({
        candidatura_id: c.id,
        vaga_id: c.id_vaga,
        profissional_id: c.id_profissional,
        contratante_id: c.contratante_id,
        status: 'recusada',
        motivo: `Candidatura expirada após ${DIAS_EXPIRACAO} dias`
      }).catch(e => console.warn('[cleanup] notify:', e.message));

      nexpiradas++;
      nnotificadas++;

      // Throttle
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`[candidatura-cleanup] ${nexpiradas} candidaturas expiradas automaticamente`);
    return { expiradas: nexpiradas, notificadas: nnotificadas, erro: null };
  } catch (err) {
    console.error('[candidatura-cleanup] fatal:', err);
    return { expiradas: 0, notificadas: 0, erro: err.message };
  }
}

/**
 * Limpa jtis expirados da blacklist (chama auth-advanced).
 */
export async function limparBlacklistExpirada() {
  try {
    const { limparBlacklistExpirada: limpar } = await import('./auth-advanced.js');
    return await limpar();
  } catch (err) {
    console.warn('[cleanup] limparBlacklistExpirada falhou:', err.message);
    return { removidos: 0 };
  }
}

/**
 * Job completo — chama todos os cleanups. Recomendado para cron diário.
 */
export async function rodarCleanupCompleto() {
  const r1 = await expirarCandidaturasAntigas();
  const r2 = await limparBlacklistExpirada();
  return {
    candidaturas: r1,
    blacklist: r2
  };
}
