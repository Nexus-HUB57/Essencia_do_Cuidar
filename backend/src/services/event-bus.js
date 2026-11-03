/**
 * services/event-bus.js
 *
 * W4, W5, M11 — Event bus centralizado para Socket.IO + auditoria.
 *
 * Funcionalidades:
 *  1. Emite eventos Socket.IO para rooms específicos (usuários)
 *  2. Registra transições de status em `candidatura_status_log` (M11)
 *  3. Dispara web push (best-effort) para usuários offline
 *  4. Emite webhook netlify.ai para eventos importantes (best-effort)
 *
 * A referência `globalThis.__io` é populada por src/index.js no boot do servidor.
 * Se undefined (ex.: em scripts de teste), os eventos Socket são silenciados.
 */
import db from '../db/driver.js';
import { notifyUser } from './push.js';
import { notifyNetlify } from './netlify.js';

/**
 * Emite evento Socket.IO para um usuário específico (room `user:<id>`).
 * Best-effort: se Socket.IO não disponível, ignora.
 */
export function emitirParaUsuario(userId, evento, payload) {
  if (globalThis.__io) {
    try {
      globalThis.__io.to(`user:${userId}`).emit(evento, payload);
      return true;
    } catch (err) {
      console.warn(`[event-bus] erro ao emitir ${evento} para user ${userId}:`, err.message);
    }
  }
  return false;
}

/**
 * Emite evento Socket.IO para múltiplos usuários (broadcast direcionado).
 */
export function emitirParaUsuarios(userIds, evento, payload) {
  let enviados = 0;
  for (const id of userIds) {
    if (emitirParaUsuario(id, evento, payload)) enviados++;
  }
  return enviados;
}

/**
 * M11 — Registra transição de status de candidatura na auditoria.
 * Idempotente: se status_anterior == status_novo, não registra.
 *
 * @param {number} idCandidatura
 * @param {string} statusAnterior (pode ser null para criação)
 * @param {string} statusNovo
 * @param {number} alteradoPor (id_user)
 * @param {string} motivo (opcional)
 */
export async function logarTransicaoCandidatura(idCandidatura, statusAnterior, statusNovo, alteradoPor, motivo = null) {
  if (statusAnterior === statusNovo) return;  // no-op
  try {
    await db.run(
      `INSERT INTO candidatura_status_log
        (id_candidatura, status_anterior, status_novo, alterado_por, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [idCandidatura, statusAnterior, statusNovo, alteradoPor, motivo]
    );
  } catch (err) {
    // Não bloqueia o fluxo principal se o log falhar
    console.warn('[event-bus] falha ao registrar transição:', err.message);
  }
}

/**
 * M11/Protocolos — Registra transição de status de um protocolo na auditoria.
 * Idempotente: se status_anterior == status_novo, não registra.
 *
 * @param {number} idProtocolo
 * @param {string|null} statusAnterior (pode ser null para criação)
 * @param {string} statusNovo
 * @param {number|null} alteradoPor (id_user, ou null para sistema)
 * @param {string|null} motivo
 */
export async function logarTransicaoProtocolo(idProtocolo, statusAnterior, statusNovo, alteradoPor, motivo = null) {
  if (statusAnterior === statusNovo) return;  // no-op
  try {
    await db.run(
      `INSERT INTO protocolo_status_log
        (id_protocolo, status_anterior, status_novo, alterado_por, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [idProtocolo, statusAnterior, statusNovo, alteradoPor, motivo]
    );
  } catch (err) {
    console.warn('[event-bus] falha ao registrar transição de protocolo:', err.message);
  }
}

/**
 * W4 — Evento: candidatura foi VISUALIZADA pelo contratante.
 * Notifica o profissional de que sua candidatura foi vista.
 *
 * @param {Object} dados - { candidatura_id, vaga_id, profissional_id, contratante_id }
 */
export async function notificarCandidaturaVisualizada(dados) {
  const { candidatura_id, vaga_id, profissional_id, contratante_id } = dados;

  // Socket.IO para o profissional
  emitirParaUsuario(profissional_id, 'candidatura:visualizada', {
    candidatura_id, vaga_id, por: contratante_id
  });

  // Web push (best-effort)
  notifyUser(profissional_id, {
    title: 'Candidatura visualizada 👁️',
    body: 'O contratante visualizou sua candidatura.',
    data: { url: '/dashboard/profissional' }
  }).catch(() => {});
}

/**
 * W4 — Evento: candidatura foi ACEITA ou RECUSADA pelo contratante.
 * Notifica o profissional em tempo real + push.
 *
 * @param {Object} dados - { candidatura_id, vaga_id, profissional_id, contratante_id, status, motivo }
 *
 * NOTA: o log de auditoria (M11) é feito pelo caller em candidaturas.js,
 * para garantir que status_anterior seja o correto (capturado antes do UPDATE).
 * Aqui só emitimos Socket.IO + Push para não duplicar a auditoria.
 */
export async function notificarCandidaturaStatus(dados) {
  const { candidatura_id, vaga_id, profissional_id, contratante_id, status, motivo } = dados;
  const evento = status === 'aceita' ? 'candidatura:aceita' : 'candidatura:recusada';

  // Socket.IO para o profissional
  emitirParaUsuario(profissional_id, evento, {
    candidatura_id, vaga_id, status, motivo, por: contratante_id
  });

  // Web push (best-effort)
  const emoji = status === 'aceita' ? '✓' : '✗';
  const titulo = status === 'aceita' ? 'Candidatura aceita! 🎉' : 'Candidatura recusada';
  notifyUser(profissional_id, {
    title: `${emoji} ${titulo}`,
    body: motivo ? motivo.slice(0, 100) : 'Confira no seu painel.',
    data: { url: '/dashboard/profissional' }
  }).catch(() => {});
}

/**
 * W5 — Evento: vaga mudou de status (fechada, pausada, reativada).
 * Notifica TODOS os profissionais que favoritaram a vaga.
 *
 * @param {Object} dados - { vaga_id, status_anterior, status_novo, contratante_id }
 */
export async function notificarVagaStatus(dados) {
  const { vaga_id, status_anterior, status_novo, contratante_id } = dados;

  if (status_anterior === status_novo) return;

  const eventoMap = {
    fechada: 'vaga:fechada',
    pausada: 'vaga:pausada',
    ativa: 'vaga:reativada'
  };
  const evento = eventoMap[status_novo];
  if (!evento) return;

  // Busca todos os profissionais que favoritaram a vaga
  const favoritaram = await db.all(
    `SELECT id_user FROM favoritos WHERE tipo = 'vaga' AND id_recurso = ?`,
    [vaga_id]
  );
  const userIds = favoritaram.map(f => f.id_user);

  // Também busca candidatos pendentes/visualizados (eles têm interesse na vaga)
  const candidatos = await db.all(
    `SELECT DISTINCT id_profissional FROM candidaturas
      WHERE id_vaga = ? AND status_candidatura IN ('pendente', 'visualizada')`,
    [vaga_id]
  );
  for (const c of candidatos) {
    if (!userIds.includes(c.id_profissional)) userIds.push(c.id_profissional);
  }

  // Broadcast direcionado
  emitirParaUsuarios(userIds, evento, {
    vaga_id, status_anterior, status_novo, por: contratante_id
  });

  // Web push para cada um (best-effort)
  for (const userId of userIds) {
    notifyUser(userId, {
      title: `Vaga ${status_novo === 'fechada' ? 'fechada' : status_novo === 'pausada' ? 'pausada' : 'reativada'}`,
      body: 'A vaga que você estava acompanhando mudou de status.',
      data: { url: `/vagas/${vaga_id}` }
    }).catch(() => {});
  }
}

/**
 * Helper: busca status atual de uma candidatura (para registrar transição correta).
 * @param {number} idCandidatura
 * @returns {string|null} status atual
 */
export async function getStatusCandidatura(idCandidatura) {
  const r = await db.get(
    'SELECT status_candidatura FROM candidaturas WHERE id = ?',
    [idCandidatura]
  );
  return r?.status_candidatura || null;
}
