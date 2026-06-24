import { useState, useCallback, useRef } from 'react';
import { ToastContext } from './toastContext';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  /** 自定义持续时间（ms），默认 2000；带 action 时默认 10000 */
  duration?: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const toast = useCallback((
    message: string,
    type: Toast['type'] = 'info',
    opts?: { action?: { label: string; onClick: () => void }; duration?: number },
  ) => {
    const id = nextIdRef.current++;
    const t: Toast = {
      id,
      message,
      type,
      action: opts?.action,
      duration: opts?.duration ?? (opts?.action ? 10000 : 2000),
    };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, t.duration);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast 容器 — 居中上方 */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 max-w-md animate-toast-in ${
              t.type === 'success' ? 'bg-emerald-600 text-white' :
              t.type === 'error' ? 'bg-red-600 text-white' :
              'bg-zinc-700 text-white'
            }`}>
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button onClick={() => { t.action!.onClick(); removeToast(t.id); }}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-md text-xs font-semibold shrink-0">
                {t.action.label}
              </button>
            )}
            <button onClick={() => removeToast(t.id)}
              className="text-white/60 hover:text-white text-lg leading-none shrink-0">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
