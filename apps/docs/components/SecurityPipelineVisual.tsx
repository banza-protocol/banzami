const stages = [
  { label: 'Autenticação',  sub: 'JWT + API Keys',      icon: '🔑', color: 'bg-slate-100 text-slate-800 border-slate-200' },
  { label: 'KYC / KYB',    sub: 'B.I. · NIF · Nível',  icon: '🪪', color: 'bg-slate-100 text-slate-800 border-slate-200' },
  { label: 'Motor de Risco',sub: 'Limites · Padrões',   icon: '🛡️', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { label: 'Idempotência',  sub: 'Chave única / Redis', icon: '🔄', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { label: 'Ledger',        sub: 'Entrada dupla · Rust', icon: '📒', color: 'bg-bz-primary-light text-bz-primary border-bz-primary/20' },
  { label: 'Audit Log',     sub: 'Imutável · Rastreável', icon: '📋', color: 'bg-bz-primary-light text-bz-primary border-bz-primary/20' },
  { label: 'Reconciliação', sub: 'Verificação contínua', icon: '✅', color: 'bg-green-50 text-green-800 border-green-200' },
]

export function SecurityPipelineVisual() {
  return (
    <div className="my-8 overflow-hidden rounded-3xl border border-bz-border bg-white p-6 shadow-card md:p-8">
      <div className="mb-6 text-center">
        <span className="badge-gold">Pipeline de Segurança</span>
        <p className="mt-2 text-xs text-bz-muted">
          Cada transacção atravessa sete camadas de segurança e auditoria
        </p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0">
        {stages.map((stage, i) => (
          <div key={i} className="flex flex-1 items-center md:flex-col">
            <div className={`flex flex-1 items-center gap-3 rounded-xl border p-3 md:flex-col md:justify-center md:gap-2 md:text-center ${stage.color}`}>
              <span className="shrink-0 text-xl md:text-2xl">{stage.icon}</span>
              <div>
                <div className="text-xs font-bold leading-tight">{stage.label}</div>
                <div className="text-[10px] opacity-70">{stage.sub}</div>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className="flex shrink-0 items-center justify-center px-1.5 md:h-6 md:w-full md:px-0">
                {/* Right arrow on desktop */}
                <svg className="hidden h-3 w-3 text-bz-muted md:block" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M10 6L4 1v10z" />
                </svg>
                {/* Down arrow on mobile */}
                <svg className="h-3 w-3 text-bz-muted md:hidden" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 10L1 4h10z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-bz-surface px-4 py-3 text-center text-xs text-bz-muted">
        Nenhuma transacção contorna este pipeline · Toda a acção financeira é rastreável e auditável
      </div>
    </div>
  )
}
