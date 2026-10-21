import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

/**
 * Sistema leve de toast notifications. Substitui os `alert()` feios
 * e os `setErro/setSucesso` locais. Empilha até 4 toasts, auto-dismiss
 * depois de 4s (configurável). Suporta success/error/info.
 */
type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastCtx {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, ttlMs?: number) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}
const Ctx = createContext<ToastCtx | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-rose-500 text-white',
  info: 'bg-serenity-500 text-white'
};
const KIND_ICONS: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ'
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, ttlMs = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }].slice(-4));
    if (ttlMs > 0) setTimeout(() => dismiss(id), ttlMs);
  }, [dismiss]);

  const api: ToastCtx = {
    toasts,
    push,
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m)
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`fade-in pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-xl shadow-card text-sm ${KIND_STYLES[t.kind]}`}
            role="alert"
          >
            <span className="font-bold text-base shrink-0">{KIND_ICONS[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-white/80 hover:text-white text-lg leading-none -mt-0.5"
              aria-label="Fechar"
            >×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider');
  return ctx;
}
