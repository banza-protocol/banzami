'use client';

import { useRef, useState, type ReactNode } from 'react';

// Reusable code window matching the developers hero code window:
// rounded card, top bar with 3 dots + a mono filename/lang label, <pre> body,
// and a small unobtrusive "Copiar" button (reads the rendered text via a ref,
// so existing call-sites don't need to pass the raw string).
export function CodeBlock({
  title,
  lang,
  children,
  className = '',
}: {
  title?: string;
  lang?: string;
  children: ReactNode;
  className?: string;
}) {
  const label = [title, lang].filter(Boolean).join(' · ');
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = preRef.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail silently.
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-card border border-border-soft bg-white shadow-[0_24px_60px_-34px_rgba(181,16,31,.35)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border-soft bg-cream-50 px-[18px] py-[13px]">
        <span className="h-[11px] w-[11px] rounded-full bg-cherry-coral" />
        <span className="h-[11px] w-[11px] rounded-full bg-pink-200" />
        <span className="h-[11px] w-[11px] rounded-full bg-[#e8d4d2]" />
        {label && (
          <span className="ml-2 bz-mono text-[12px] font-semibold text-ink-muted">{label}</span>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copiado' : 'Copiar código'}
          className="bz-mono ml-auto inline-flex flex-none items-center gap-[5px] rounded-[8px] px-[9px] py-[4px] text-[11px] font-bold text-ink-muted transition-colors hover:bg-pink-100 hover:text-cherry-dark"
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="#1f7a45"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-received">Copiado</span>
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Copiar
            </>
          )}
        </button>
      </div>
      <pre
        ref={preRef}
        className="m-0 overflow-x-auto p-[22px] bz-mono text-[12.5px] leading-[1.7] text-[#3a2a2e]"
      >
        {children}
      </pre>
    </div>
  );
}
