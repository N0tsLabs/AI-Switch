import { useState, useCallback, useRef, useEffect } from 'react';
import { ToastContext } from './toastContext';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  duration?: number;
  timerId?: ReturnType<typeof setTimeout>;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

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
    t.timerId = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, t.duration);
    timersRef.current.set(id, t.timerId);
  }, []);

  const removeToast = (id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
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
