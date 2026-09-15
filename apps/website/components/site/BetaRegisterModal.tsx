'use client';

// An accessible modal dialog for the beta registration form (APP-BETA-001).
//
// It is a real dialog: focus moves in on open and is trapped inside while open,
// Escape closes it, a click on the backdrop closes it, and focus returns to the
// element that opened it. The page behind it is inert to the pointer and hidden
// from assistive technology (aria-hidden is not set on the dialog itself). It
// renders nothing when closed, so it costs a first paint nothing.

import { useCallback, useEffect, useRef } from 'react';

export function BetaRegisterModal({
  open,
  onClose,
  title,
  subtitle,
  labelledById,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  labelledById: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Remember what had focus so we can give it back on close.
  useEffect(() => {
    if (open) {
      opener.current = (document.activeElement as HTMLElement) ?? null;
    }
  }, [open]);

  // Move focus into the dialog when it opens; return it when it closes.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Lock the page scroll behind the dialog.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first focusable control (or the panel itself).
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input:not([type="hidden"]):not([tabindex="-1"]), select, [tabindex]:not([tabindex="-1"])',
    );
    (focusables[0] ?? panel).focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      opener.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const f = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([type="hidden"]):not([tabindex="-1"]), select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative my-8 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl outline-none sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <h2 id={labelledById} className="pr-8 text-[22px] font-black leading-tight text-neutral-900">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
