import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

/**
 * useMatchingEvents — Hook React que conecta ao Socket.IO e escuta
 * eventos de matching em tempo real:
 *
 *   - candidatura:visualizada → sua candidatura foi vista pelo contratante
 *   - candidatura:aceita → sua candidatura foi aceita (vaga fechada)
 *   - candidatura:recusada → sua candidatura foi recusada
 *   - vaga:fechada → uma vaga que você favoritou/candidatou foi fechada
 *   - vaga:pausada → uma vaga foi pausada
 *   - vaga:reativada → uma vaga pausada foi reativada
 *
 * Uso:
 *   const { eventos, totalNaoLidos } = useMatchingEvents();
 *   // eventos: array de eventos recebidos (não lidos pelo usuário)
 *   // totalNaoLidos: número de eventos não lidos
 *
 *   // Para marcar como lidos:
 *   // eventos.forEach(e => marcarLido(e.id))
 */
interface MatchingEvent {
  id: string;
  tipo: 'candidatura:visualizada' | 'candidatura:aceita' | 'candidatura:recusada' |
        'vaga:fechada' | 'vaga:pausada' | 'vaga:reativada' |
        'mensagem:nova';
  timestamp: number;
  payload: any;
  lido: boolean;
}

const STORAGE_KEY = 'essencia_matching_events';

function carregarEventos(): MatchingEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 50);  // max 50
  } catch {
    return [];
  }
}

function salvarEventos(eventos: MatchingEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(eventos.slice(0, 50)));
  } catch {
    // localStorage pode estar cheio
  }
}

export function useMatchingEvents() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<MatchingEvent[]>(carregarEventos);
  const [conectado, setConectado] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('essencia_token');
    if (!token) return;

    // Conecta ao Socket.IO com auth
    const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';
    // Socket.IO conecta direto no backend (não no /api)
    const socketUrl = API_BASE === '/api'
      ? window.location.origin  // em dev, vite proxy encaminha /socket.io para :4000
      : API_BASE.replace(/\/api$/, '');

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => setConectado(true));
    socket.on('disconnect', () => setConectado(false));

    const adicionarEvento = (tipo: MatchingEvent['tipo'], payload: any) => {
      const novo: MatchingEvent = {
        id: `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tipo,
        timestamp: Date.now(),
        payload,
        lido: false
      };
      setEventos(prev => {
        const atualizado = [novo, ...prev].slice(0, 50);
        salvarEventos(atualizado);
        return atualizado;
      });
    };

    // W4 — Eventos de candidatura
    socket.on('candidatura:visualizada', (p: any) => adicionarEvento('candidatura:visualizada', p));
    socket.on('candidatura:aceita', (p: any) => adicionarEvento('candidatura:aceita', p));
    socket.on('candidatura:recusada', (p: any) => adicionarEvento('candidatura:recusada', p));

    // W5 — Eventos de vaga
    socket.on('vaga:fechada', (p: any) => adicionarEvento('vaga:fechada', p));
    socket.on('vaga:pausada', (p: any) => adicionarEvento('vaga:pausada', p));
    socket.on('vaga:reativada', (p: any) => adicionarEvento('vaga:reativada', p));

    // Chat (já existente)
    socket.on('mensagem:nova', (p: any) => adicionarEvento('mensagem:nova', p));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConectado(false);
    };
  }, [user]);

  // Persiste quando muda
  useEffect(() => {
    salvarEventos(eventos);
  }, [eventos]);

  const marcarLido = (id: string) => {
    setEventos(prev => prev.map(e => e.id === id ? { ...e, lido: true } : e));
  };

  const marcarTodosLidos = () => {
    setEventos(prev => prev.map(e => ({ ...e, lido: true })));
  };

  const limparEventos = () => {
    setEventos([]);
    salvarEventos([]);
  };

  const totalNaoLidos = eventos.filter(e => !e.lido).length;

  return {
    eventos,
    conectado,
    totalNaoLidos,
    marcarLido,
    marcarTodosLidos,
    limparEventos
  };
}

export default useMatchingEvents;
