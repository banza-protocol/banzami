export function WalletToWalletVisual() {
  return (
    <div className="my-8 overflow-hidden rounded-3xl border border-bz-border bg-white p-6 shadow-card md:p-8">
      <div className="mb-6 text-center">
        <span className="badge-gold">Operação Fundamental</span>
        <p className="mt-2 text-xs text-bz-muted">Toda a transacção Banzami é uma transferência entre carteiras</p>
      </div>

      <div className="flex flex-col items-center gap-6 md:flex-row md:items-stretch md:gap-4">
        {/* Carteira Consumidor */}
        <div className="w-full flex-1 rounded-2xl border-2 border-bz-border bg-bz-bg p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bz-muted">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Carteira Consumidor
          </div>
          <div className="text-2xl font-bold text-bz-text">@joao.silva</div>
          <div className="mt-2 text-sm text-bz-muted">Saldo: 50.000 Kz</div>
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm">
            <span className="font-semibold text-bz-primary">− 2.500 Kz</span>
            <span className="ml-2 text-bz-muted">Débito</span>
          </div>
        </div>

        {/* Ledger bridge */}
        <div className="flex flex-col items-center justify-center gap-2 md:py-4">
          {/* Arrow down on mobile */}
          <div className="flex flex-col items-center gap-1 md:hidden">
            <div className="h-6 w-0.5 bg-bz-primary/30" />
            <svg className="h-4 w-4 text-bz-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16l-6-8h12z" />
            </svg>
          </div>
          {/* Arrow right on desktop */}
          <div className="hidden items-center gap-1 md:flex">
            <div className="h-0.5 w-6 bg-bz-primary/30" />
            <svg className="h-4 w-4 text-bz-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12l-8-6v12z" />
            </svg>
          </div>
          <div className="rounded-xl border border-bz-primary/20 bg-bz-primary-light px-3 py-2 text-center">
            <div className="text-xs font-bold text-bz-primary">LEDGER</div>
            <div className="mt-0.5 text-[10px] text-bz-muted">Entrada dupla</div>
          </div>
          {/* Arrow right on desktop */}
          <div className="hidden items-center gap-1 md:flex">
            <svg className="h-4 w-4 text-bz-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12l-8-6v12z" />
            </svg>
            <div className="h-0.5 w-6 bg-bz-primary/30" />
          </div>
          {/* Arrow down on mobile */}
          <div className="flex flex-col items-center gap-1 md:hidden">
            <svg className="h-4 w-4 text-bz-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16l-6-8h12z" />
            </svg>
            <div className="h-6 w-0.5 bg-bz-primary/30" />
          </div>
        </div>

        {/* Carteira Comerciante */}
        <div className="w-full flex-1 rounded-2xl border-2 border-bz-primary/30 bg-bz-bg p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bz-muted">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Carteira Comerciante
          </div>
          <div className="text-2xl font-bold text-bz-text">@cantina.luanda</div>
          <div className="mt-2 text-sm text-bz-muted">Saldo actualizado ao instante</div>
          <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm">
            <span className="font-semibold text-green-700">+ 2.500 Kz</span>
            <span className="ml-2 text-bz-muted">Crédito</span>
          </div>
        </div>
      </div>

      {/* Invariant note */}
      <div className="mt-6 rounded-xl border border-bz-border bg-bz-surface px-4 py-3 text-center text-xs text-bz-muted">
        Débito + Crédito = 0 &nbsp;·&nbsp; Entrada imutável &nbsp;·&nbsp; Liquidação em tempo real &nbsp;·&nbsp; Sem numeração de cartão
      </div>
    </div>
  )
}
