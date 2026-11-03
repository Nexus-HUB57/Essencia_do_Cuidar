import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type ToastTipo = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  tipo: ToastTipo;
  titulo: string;
  mensagem?: string;
}

interface ToastContextType {
  push: (tipo: ToastTipo, titulo: string, mensagem?: string) => void;
  success: (titulo: string, mensagem?: string) => void;
  error: (titulo: string, mensagem?: string) => void;
  info: (titulo: string, mensagem?: string) => void;
  warning: (titulo: string, mensagem?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ICONES: Record<ToastTipo, string> = {
  success: '✅',
  error:   '❌',
  info:    'ℹ️',
  warning: '⚠️'
};

const CORES: Record<ToastTipo, string> = {
  success: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  error:   'bg-rose-50 border-rose-300 text-rose-800',
  info:    'bg-serenity-50 border-serenity-300 text-serenity-800',
  warning: 'bg-amber-50 border-amber-300 text-amber-800'
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tipo: ToastTipo, titulo: string, mensagem?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tipo, titulo, mensagem }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const ctx: ToastContextType = {
    push,
    success: (t, m) => push('success', t, m),
    error:   (t, m) => push('error',   t, m),
    info:    (t, m) => push('info',    t, m),
    warning: (t, m) => push('warning', t, m)
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`fade-in flex items-start gap-2 px-4 py-3 rounded-xl border-2 shadow-card ${CORES[t.tipo]}`}
            role="alert"
          >
            <span className="text-lg shrink-0">{ICONES[t.tipo]}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{t.titulo}</p>
              {t.mensagem && <p className="text-xs mt-0.5 opacity-90">{t.mensagem}</p>}
            </div>
            <button
              onClick={() => setToasts((curr) => curr.filter((x) => x.id !== t.id))}
              className="text-current opacity-50 hover:opacity-100 text-sm leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider');
  return ctx;
}
