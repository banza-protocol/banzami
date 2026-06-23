import type { ReactNode } from 'react';

// Reusable code window matching the developers hero code window:
// rounded card, top bar with 3 dots + a mono filename/lang label, <pre> body.
// Presentational only (no hooks). Color strings inside `children` with
// `text-[#1f9a5b]`, keywords with `text-cherry`, etc.
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
      </div>
      <pre className="m-0 overflow-x-auto p-[22px] bz-mono text-[12.5px] leading-[1.7] text-[#3a2a2e]">
        {children}
      </pre>
    </div>
  );
}
