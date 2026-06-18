import { useState, useCallback, useRef } from 'react';
import { ToastContext } from './toastContext';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
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
            <button onClick={() => removeToast(t.id)}
              className="text-white/60 hover:text-white text-lg leading-none shrink-0">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
