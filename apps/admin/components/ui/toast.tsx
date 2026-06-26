'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

// Global toast (README §Toast): bottom-right, dark #1a1416, colored icon by
// type, auto-dismiss ~2.8s. Used for every admin action confirmation/error.

type ToastType = 'success' | 'danger' | 'warning' | 'info';
type Toast = { id: number; type: ToastType; message: string };

const ICON_BG: Record<ToastType, string> = {
  success: '#1f9d57',
  danger:  '#B5101F',
  warning: '#b5790f',
  info:    '#3a5bd0',
};

const ToastCtx = createContext<{ show: (type: ToastType, message: string) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx.show;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-2">
        {toasts.map((t) => {
          const Icon = t.type === 'success' ? Check : t.type === 'danger' ? X : t.type === 'warning' ? AlertTriangle : Info;
          return (
            <div
              key={t.id}
              className="adm-toast-in flex max-w-[380px] items-center gap-3 rounded-[14px] bg-[#1a1416] px-5 py-[15px] text-white shadow-[0_20px_50px_-16px_rgba(0,0,0,0.5)]"
            >
              <span
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px]"
                style={{ background: ICON_BG[t.type] }}
              >
                <Icon size={15} color="#fff" strokeWidth={2.6} />
              </span>
              <span className="text-[14px] font-bold">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
