const steps = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <rect x="3" y="3" width="18" height="18" rx="3" strokeLinecap="round" />
        <path d="M9 9h6M9 12h6M9 15h3" strokeLinecap="round" />
        <path d="M3 9h2M3 12h2M3 15h2" strokeLinecap="round" />
      </svg>
    ),
    label: 'QR Escaneado',
    sublabel: 'Câmara detecta o código',
    color: 'bg-bz-surface text-bz-primary border-bz-border',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
    label: 'Confirmação',
    sublabel: 'Consumidor autoriza',
    color: 'bg-bz-surface text-bz-primary border-bz-border',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M4 7h16M4 7a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v0a2 2 0 01-2 2M4 7l1 12a2 2 0 002 2h10a2 2 0 002-2L20 7" strokeLinecap="round" />
      </svg>
    ),
    label: 'Ledger',
    sublabel: 'Débito ↔ Crédito atómico',
    color: 'bg-bz-primary text-white border-bz-primary',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
        <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" strokeLinecap="round" />
      </svg>
    ),
    label: 'Carteira Creditada',
    sublabel: 'Comerciante recebe ao instante',
    color: 'bg-bz-surface text-bz-primary border-bz-border',
  },
]

export function PaymentFlowDiagram() {
  return (
    <div className="my-8">
      {/* Mobile: vertical */}
      <div className="flex flex-col items-center gap-0 sm:hidden">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`flow-step flex w-full max-w-xs items-center gap-4 rounded-2xl border p-4 ${step.color}`}>
              <div className="shrink-0">{step.icon}</div>
              <div>
                <div className="text-sm font-semibold">{step.label}</div>
                <div className="text-xs opacity-70">{step.sublabel}</div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex h-8 flex-col items-center justify-center">
                <div className="h-4 w-0.5 bg-bz-border" />
                <svg className="h-3 w-3 text-bz-primary" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 10L1 4h10z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: horizontal */}
      <div className="hidden items-stretch gap-0 sm:flex">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div className={`flow-step flex flex-1 flex-col items-center gap-3 rounded-2xl border p-5 text-center ${step.color}`}>
              <div>{step.icon}</div>
              <div>
                <div className="text-sm font-semibold leading-tight">{step.label}</div>
                <div className="mt-0.5 text-xs opacity-70">{step.sublabel}</div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex shrink-0 items-center px-2">
                <div className="h-0.5 w-4 bg-bz-border" />
                <svg className="h-3 w-3 text-bz-primary" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M10 6L4 1v10z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Flow label */}
      <div className="mt-4 text-center font-mono text-xs text-bz-muted">
        QR Escaneado &nbsp;→&nbsp; Autorizado &nbsp;→&nbsp; Ledger Actualizado &nbsp;→&nbsp; Pago Instantaneamente
      </div>
    </div>
  )
}
