'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Copy toast — dark pill fixed bottom-centre. Faithful to the dossier: appears
// in .2s and auto-hides after 1.6s. `flash(msg)` is exposed via context so both
// the [data-copy] click delegation and bespoke copy buttons (cURL, secret) can
// trigger it.

type ToastCtx = { flash: (msg?: string) => void };
const Ctx = createContext<ToastCtx>({ flash: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('Copiado');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m?: string) => {
    setMsg(m || 'Copiado');
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 1600);
  }, []);

  return (
    <Ctx.Provider value={{ flash }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 26,
          left: '50%',
          transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '12px 20px',
          borderRadius: 14,
          background: '#2a2024',
          color: '#fff',
          fontSize: 13.5,
          fontWeight: 800,
          boxShadow: '0 20px 44px -18px rgba(0,0,0,.5)',
          opacity: visible ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity .2s, transform .2s',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4 4 10-10" stroke="#7BE0A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{msg}</span>
      </div>
    </Ctx.Provider>
  );
}

/** Copies text to the clipboard, failing silently in insecure contexts. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard unavailable — ignore */
  }
}
