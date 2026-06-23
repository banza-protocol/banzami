// Horizontal premium flow (Stripe-style). Collapses to vertical on mobile.
// Cliente → QR / @banza → Confirmação → Ledger → Recibo → Webhook → Comerciante.
// Each node carries a small minimalist line glyph + a short caption on the key
// steps, for a denser, clearer left→right (Cliente→Comerciante) read.

import type { ReactNode } from 'react';

type Step = { label: string; caption?: string; glyph: ReactNode };

const gp = { stroke: '#B5101F', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const STEPS: Step[] = [
  {
    label: 'Cliente',
    caption: 'Inicia',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.4" {...gp} />
        <path d="M5 19c1.2-3.4 4-5 7-5s5.8 1.6 7 5" {...gp} />
      </svg>
    ),
  },
  {
    label: 'QR / @banza',
    caption: 'Lê / endereça',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1.4" {...gp} />
        <rect x="14" y="4" width="6" height="6" rx="1.4" {...gp} />
        <rect x="4" y="14" width="6" height="6" rx="1.4" {...gp} />
        <path d="M14 14h2.5v2.5M20 14v6M14 20h6" {...gp} />
      </svg>
    ),
  },
  {
    label: 'Confirmação',
    caption: 'Autoriza',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" {...gp} />
        <path d="M8.5 12l2.5 2.5 4.5-5" {...gp} />
      </svg>
    ),
  },
  {
    label: 'Ledger',
    caption: 'Dupla entrada',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4v16M5 9l-1.6 5h3.2L5 9zM19 9l-1.6 5h3.2L19 9zM5 9h14" {...gp} />
        <path d="M9 20h6" {...gp} />
      </svg>
    ),
  },
  {
    label: 'Recibo',
    caption: 'Comprovativo',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" {...gp} />
        <path d="M9 8h6M9 12h6" {...gp} />
      </svg>
    ),
  },
  {
    label: 'Webhook',
    caption: 'Evento assinado',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 9a3 3 0 1 1 4.2 2.7L16 17" {...gp} />
        <circle cx="7" cy="17" r="3" {...gp} />
        <circle cx="17" cy="17" r="3" {...gp} />
        <path d="M10 17h4" {...gp} />
      </svg>
    ),
  },
  {
    label: 'Comerciante',
    caption: 'Recebe',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 9.5 6.2 5h11.6L19 9.5a2.5 2.5 0 0 1-4.7 1 2.5 2.5 0 0 1-4.6 0 2.5 2.5 0 0 1-4.7-1z" {...gp} />
        <path d="M6 11v8h12v-8" {...gp} />
      </svg>
    ),
  },
];

function FlowConnector({ vertical }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="flex h-[22px] items-center justify-center md:hidden">
        <svg width="12" height="22" viewBox="0 0 12 22" fill="none" aria-hidden="true">
          <path d="M6 0v14" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          <path d="M2 11l4 5 4-5" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative hidden h-[3px] w-[22px] flex-none self-center md:block">
      <div
        className="h-full w-full rounded-full"
        style={{ background: 'linear-gradient(90deg,#FBD2D0,#E8434B,#FBD2D0)' }}
      />
      <span
        className="anim-coin absolute top-1/2 h-[7px] w-[7px] rounded-full"
        style={{ background: '#B5101F', boxShadow: '0 0 8px 2px rgba(232,67,75,.5)' }}
      />
    </div>
  );
}

export function PaymentFlowDiagram() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between md:mb-5">
        <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          Cliente
        </span>
        <span className="hidden flex-1 mx-3 h-px self-center md:block" style={{ background: 'linear-gradient(90deg,#FBD2D0,transparent)' }} />
        <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          Comerciante
        </span>
      </div>
      <div className="flex flex-col items-stretch md:flex-row md:flex-wrap md:items-stretch md:justify-center md:gap-y-3">
        {STEPS.map((step, i) => (
          <div key={step.label} className="contents">
            <div className="flex min-w-[112px] flex-col items-center gap-[7px] rounded-card border border-border-soft bg-white px-[14px] py-[13px] text-center shadow-[0_14px_34px_-26px_rgba(181,16,31,.36)]">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-cream-50">
                {step.glyph}
              </span>
              <span className="bz-mono text-[12.5px] font-bold leading-tight text-cherry-dark">
                {step.label}
              </span>
              {step.caption && (
                <span className="text-[10.5px] font-semibold leading-tight text-ink-muted">
                  {step.caption}
                </span>
              )}
            </div>
            {i < STEPS.length - 1 && (
              <>
                <FlowConnector />
                <FlowConnector vertical />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
