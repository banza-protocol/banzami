const pipeline = [
  { label: 'App Externa',    sub: 'Táxi · Ecommerce · Escola', icon: '📱', highlight: false },
  { label: 'Banza SDK',      sub: 'TS · PHP · Go · Python',    icon: '🔧', highlight: false },
  { label: 'API Gateway',    sub: 'Auth · Rate limit · Routing', icon: '🚪', highlight: false },
  { label: 'Core Rust',      sub: 'Risk · Compliance · Ledger', icon: '⚙️', highlight: true  },
  { label: 'Ledger',         sub: 'Entrada dupla · Imutável',   icon: '📒', highlight: true  },
  { label: 'Webhook',        sub: 'Notificação instantânea',    icon: '📡', highlight: false },
]

export function SDKArchitectureVisual() {
  return (
    <div className="my-8 overflow-hidden rounded-3xl border border-bz-border bg-white p-6 shadow-card md:p-8">
      <div className="mb-6 text-center">
        <span className="badge-gold">Arquitectura SDK-First</span>
        <p className="mt-2 text-xs text-bz-muted">
          Todas as integrações usam SDKs oficiais — nunca HTTP directo
        </p>
      </div>

      {/* Desktop horizontal pipeline */}
      <div className="hidden items-stretch gap-0 md:flex">
        {pipeline.map((step, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div
              className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all ${
                step.highlight
                  ? 'border-bz-primary bg-bz-primary text-white'
                  : 'border-bz-border bg-bz-surface text-bz-text'
              }`}
            >
              <span className="text-2xl">{step.icon}</span>
              <div>
                <div className="text-xs font-bold leading-tight">{step.label}</div>
                <div className={`mt-0.5 text-[10px] ${step.highlight ? 'text-red-200' : 'text-bz-muted'}`}>
                  {step.sub}
                </div>
              </div>
            </div>
            {i < pipeline.length - 1 && (
              <div className="flex shrink-0 items-center gap-0.5 px-1">
                <div className="h-px w-3 bg-bz-border" />
                <svg className="h-3 w-3 text-bz-muted" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M10 6L4 1v10z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile vertical pipeline */}
      <div className="flex flex-col items-center gap-0 md:hidden">
        {pipeline.map((step, i) => (
          <div key={i} className="flex w-full flex-col items-center">
            <div
              className={`flex w-full max-w-sm items-center gap-4 rounded-2xl border p-4 ${
                step.highlight
                  ? 'border-bz-primary bg-bz-primary text-white'
                  : 'border-bz-border bg-bz-surface text-bz-text'
              }`}
            >
              <span className="text-2xl">{step.icon}</span>
              <div>
                <div className="text-sm font-bold">{step.label}</div>
                <div className={`text-xs ${step.highlight ? 'text-red-200' : 'text-bz-muted'}`}>{step.sub}</div>
              </div>
            </div>
            {i < pipeline.length - 1 && (
              <div className="flex h-6 flex-col items-center justify-center">
                <svg className="h-4 w-4 text-bz-muted" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 10L1 4h10z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
