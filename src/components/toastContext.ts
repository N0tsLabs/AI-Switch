import { createContext } from 'react';

interface ToastContextValue {
  toast: (
    message: string,
    type?: 'success' | 'error' | 'info',
    opts?: { action?: { label: string; onClick: () => void }; duration?: number },
  ) => void;
}

export const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
