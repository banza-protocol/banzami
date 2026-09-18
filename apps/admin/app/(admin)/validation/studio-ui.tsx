'use client';

/**
 * Validation Studio design primitives.
 *
 * The Studio is the surface an operator reads before authorising something
 * irreversible, so it is built to be read: a rounded icon chip anchors every
 * section, numbers are large and captioned, and nothing that matters is a bare
 * table cell. The palette is the Banzami one — #B5101F and its tints — used for
 * emphasis, never for decoration.
 *
 * Two rules govern the vocabulary and neither is cosmetic:
 *
 *   1. No category collapses into another. DEFINED is not PLANNED, PLANNED is
 *      not OBSERVED, OBSERVED is not PASSED. Nothing shows PASS before
 *      something observed it.
 *   2. A live number and a pinned snapshot are never rendered alike.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/* ── surfaces ───────────────────────────────────────────────────────────── */

export function Panel({ children, className = '', onClick }: {
  children: ReactNode; className?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[16px] border border-[#f1e3e3] bg-white ${
        onClick ? 'cursor-pointer transition-shadow hover:shadow-[0_2px_10px_-4px_rgba(90,60,60,0.18)]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function IconChip({ Icon, size = 'md', tone = 'brand' }: {
  Icon: LucideIcon; size?: 'sm' | 'md'; tone?: 'brand' | 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const box = size === 'sm' ? 'h-[32px] w-[32px] rounded-[10px]' : 'h-[38px] w-[38px] rounded-[12px]';
  const glyph = size === 'sm' ? 'h-[16px] w-[16px]' : 'h-[19px] w-[19px]';
  const tones = {
    brand: 'bg-[#FBE9E9] text-[#B5101F]', neutral: 'bg-[#F4F1F1] text-[#6a5a5e]',
    good: 'bg-[#E9F7EE] text-green-700', warn: 'bg-[#FDF3E0] text-amber-700', bad: 'bg-[#FDECEC] text-red-700',
  }[tone];
  return (
    <span className={`flex ${box} flex-none items-center justify-center ${tones}`}>
      <Icon className={glyph} strokeWidth={1.9} aria-hidden />
    </span>
  );
}

export function Dot({ tone }: { tone: 'good' | 'warn' | 'bad' | 'idle' }) {
  const c = { good: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-red-500', idle: 'bg-neutral-400' }[tone];
  return <span className={`inline-block h-[7px] w-[7px] flex-none rounded-full ${c}`} aria-hidden />;
}

export function SectionHeader({ Icon, title, subtitle, action, tone = 'brand' }: {
  Icon: LucideIcon; title: string; subtitle?: string; action?: ReactNode;
  tone?: 'brand' | 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-2.5">
        <IconChip Icon={Icon} tone={tone} />
        <div>
          <h2 className="text-[16px] font-extrabold leading-tight tracking-[-0.01em] text-[#1a1a1a]">{title}</h2>
          {subtitle && <p className="mt-[3px] text-[12.5px] leading-snug text-[#9a8a8e]">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

/* ── metric row ─────────────────────────────────────────────────────────── */

export function MetricCard({ Icon, label, value, caption, tone = 'brand' }: {
  Icon: LucideIcon; label: string; value: ReactNode; caption: string;
  tone?: 'brand' | 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return (
    <Panel className="px-[15px] py-[14px]">
      <div className="flex items-start gap-2.5">
        <IconChip Icon={Icon} size="sm" tone={tone} />
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-[#6a5a5e]">{label}</p>
          <div className="mt-[3px] truncate text-[18px] font-black leading-tight tracking-[-0.01em] text-[#1a1a1a]">
            {value}
          </div>
          <p className="mt-[2px] truncate text-[11.5px] text-[#a99a9e]">{caption}</p>
        </div>
      </div>
    </Panel>
  );
}

/* ── pills ──────────────────────────────────────────────────────────────── */

export function Pill({ children, className = '', title }: {
  children: ReactNode; className?: string; title?: string;
}) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold ${className}`}>
      {children}
    </span>
  );
}

export const STATUS_STYLE: Record<string, string> = {
  DECLARED: 'bg-[#F1EEEE] text-[#6a5a5e]',
  SPECIFIED: 'bg-[#E8F0FD] text-blue-800',
  AUTOMATED: 'bg-[#EAE9FB] text-indigo-800',
  RUNTIME_PROVEN: 'bg-[#E9F7EE] text-green-800',
};

export const STATUS_MEANING: Record<string, string> = {
  DECLARED: 'O âmbito está escrito. Nenhum percurso executável está definido.',
  SPECIFIED: 'Existe pelo menos um percurso com passos e asserções, sem automação ligada.',
  AUTOMATED: 'Um percurso está automatizado e nomeia o harness que o executa.',
  RUNTIME_PROVEN: 'Observado a passar numa execução real. Inalcançável enquanto não existir motor de execução.',
};

export function StatusPill({ status }: { status: string }) {
  return <Pill className={STATUS_STYLE[status] ?? 'bg-[#F1EEEE] text-[#6a5a5e]'} title={STATUS_MEANING[status]}>{status}</Pill>;
}

export const CHECK_STYLE: Record<string, string> = {
  PASS: 'bg-[#E9F7EE] text-green-800', WARN: 'bg-[#FDF3E0] text-amber-900',
  FAIL: 'bg-[#FDECEC] text-red-800', SKIPPED: 'bg-[#F4F1F1] text-[#6a5a5e]',
  UNAVAILABLE: 'bg-[#EDE9E9] text-[#5a4a4e]', EXPECTED: 'bg-[#F4F1F1] text-[#6a5a5e]',
};

export const STATE_STYLE: Record<string, string> = {
  PREPARING: 'bg-[#F4F1F1] text-[#6a5a5e]', PREFLIGHT_RUNNING: 'bg-[#E8F0FD] text-blue-800',
  BLOCKED: 'bg-[#FDECEC] text-red-800', READY: 'bg-[#E9F7EE] text-green-800',
  QUEUED: 'bg-[#E8F0FD] text-blue-800', RUNNING: 'bg-[#E8F0FD] text-blue-800',
  COMPLETED: 'bg-[#E9F7EE] text-green-800', CANCELLED: 'bg-[#EDE9E9] text-[#5a4a4e]',
  ABANDONED: 'bg-[#FDF3E0] text-amber-900',
};

export const VERDICT_SKIN: Record<string, string> = {
  HEALTHY: 'border-green-300 bg-[#F2FBF5] text-green-800',
  DEGRADED: 'border-amber-300 bg-[#FDF8EC] text-amber-900',
  UNHEALTHY: 'border-red-300 bg-[#FDF1F1] text-red-800',
};

/** Whether a value is live or a snapshot. Mixing them without saying which is
 *  how a dashboard starts lying about history. */
export function AsOf({ live, at }: { live: boolean; at?: string }) {
  return live ? (
    <Pill className="bg-[#E6F2FA] text-sky-900" title="Valor lido agora, do sistema em execução.">ESTADO ACTUAL</Pill>
  ) : (
    <Pill className="bg-[#EFE9FA] text-violet-900" title={`Instantâneo fixado quando a execução foi preparada${at ? `: ${at}` : ''}.`}>
      FIXADO NA PREPARAÇÃO
    </Pill>
  );
}

/* ── controls ───────────────────────────────────────────────────────────── */

export function Button({ children, onClick, disabled, variant = 'secondary', Icon, full }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: 'primary' | 'secondary'; Icon?: LucideIcon; full?: boolean;
}) {
  const skin = variant === 'primary'
    ? 'bg-[#B5101F] text-white hover:bg-[#9A1B22] shadow-[0_1px_2px_rgba(181,16,31,0.28)]'
    : 'border-[1.5px] border-[#ecdcdc] bg-white text-[#1a1a1a] hover:bg-[#FDF4F4]';
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[11px] px-[15px] py-[9px] text-[13.5px] font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-banzami disabled:opacity-50 ${full ? 'w-full' : ''} ${skin}`}>
      {Icon && <Icon className="h-[15px] w-[15px] flex-none" strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

export function MoreLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-extrabold text-[#B5101F] hover:text-[#9A1B22]">
      {label} <span aria-hidden>→</span>
    </a>
  );
}

/* ── content helpers ────────────────────────────────────────────────────── */

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="text-[12.5px] text-[#9a8a8e]">{label}</span>
      <span className="text-[13px] font-extrabold text-[#1a1a1a]">{value}</span>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">{label}</dt>
      <dd className="mt-[3px] text-[13.5px] text-[#1a1a1a]">{children}</dd>
    </div>
  );
}

/** A short "why does this matter?" note, from the Studio's own architecture. */
export function Why({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 border-l-[2.5px] border-[#f1e3e3] pl-3 text-[12px] leading-[1.5] text-[#8a7a7e]">{children}</p>
  );
}

export function Empty({ Icon, title, detail }: { Icon?: LucideIcon; title: string; detail: string }) {
  return (
    <div className="rounded-[13px] border border-dashed border-[#eadada] px-5 py-7 text-center">
      {Icon && <Icon className="mx-auto mb-2 h-[22px] w-[22px] text-[#cbbaba]" strokeWidth={1.6} aria-hidden />}
      <p className="text-[13.5px] font-extrabold text-[#1a1a1a]">{title}</p>
      <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] leading-[1.5] text-[#9a8a8e]">{detail}</p>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-[#f4eeee] ${className}`} />;
}

/** A hash shown short, readable in full on hover, copyable on click. */
export function Hash({ value, chars = 12 }: { value: string; chars?: number }) {
  if (!value) return <span className="text-[#a99a9e]">—</span>;
  return (
    <button
      type="button"
      title={`${value}\n(clique para copiar)`}
      onClick={() => { void navigator.clipboard?.writeText(value); }}
      className="font-mono text-[12px] text-[#4a4a4a] underline-offset-2 hover:underline"
    >
      {value.length > chars ? `${value.slice(0, chars)}…` : value}
    </button>
  );
}
