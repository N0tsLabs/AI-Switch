import { createContext } from 'react';

interface ToastContextValue {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
