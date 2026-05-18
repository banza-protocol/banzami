function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex w-[160px] shrink-0 flex-col overflow-hidden rounded-[2rem] border-[3px] border-bz-text bg-white shadow-card-lg">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-bz-text px-4 py-1.5">
        <span className="text-[9px] font-semibold text-white">9:41</span>
        <div className="flex gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-white/70" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/70" />
          <div className="h-1.5 w-2.5 rounded-sm bg-white/70" />
        </div>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
      {/* Home bar */}
      <div className="flex justify-center pb-2 pt-1">
        <div className="h-1 w-10 rounded-full bg-bz-border" />
      </div>
    </div>
  )
}

export function MobilePaymentMockup() {
  return (
    <div className="my-8 overflow-hidden rounded-3xl border border-bz-border bg-gradient-to-br from-bz-bg to-white p-6 shadow-card md:p-8">
      <div className="mb-8 text-center">
        <span className="badge-gold">Experiência Mobile</span>
        <p className="mt-2 text-sm text-bz-muted">Escanear → Confirmar → Pago instantaneamente</p>
      </div>

      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-center">
        {/* Step 1: QR Scan */}
        <div className="flex flex-col items-center gap-3">
          <PhoneShell>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-bz-text p-4">
              <div className="text-white/60 text-[10px] font-medium uppercase tracking-wider">Escanear</div>
              {/* Fake QR viewfinder */}
              <div className="relative flex h-20 w-20 items-center justify-center rounded-xl border-2 border-bz-primary">
                <div className="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-bz-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-bz-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-bz-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-bz-primary rounded-br-lg" />
                <div className="grid grid-cols-3 gap-0.5">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className={`h-2.5 w-2.5 rounded-sm ${i % 3 === 1 ? 'bg-white/20' : 'bg-white/60'}`} />
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-white/50">@cantina.luanda</div>
            </div>
          </PhoneShell>
          <div className="text-xs font-medium text-bz-muted">1. Escanear QR</div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center sm:mt-16">
          <svg className="h-6 w-6 rotate-90 text-bz-border sm:rotate-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.172 12l-4.95-4.95 1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
          </svg>
        </div>

        {/* Step 2: Confirmation */}
        <div className="flex flex-col items-center gap-3">
          <PhoneShell>
            <div className="flex flex-1 flex-col bg-white p-3">
              <div className="mb-3 text-center text-[10px] font-semibold text-bz-muted uppercase tracking-wider">Confirmar</div>
              <div className="rounded-xl bg-bz-surface p-3 text-center">
                <div className="text-[10px] text-bz-muted">Para</div>
                <div className="text-xs font-bold text-bz-text">@cantina.luanda</div>
                <div className="mt-2 text-[10px] text-bz-muted">Valor</div>
                <div className="text-lg font-bold text-bz-primary">2.500 Kz</div>
              </div>
              <div className="mt-3 rounded-xl bg-bz-primary py-2 text-center text-[11px] font-bold text-white">
                CONFIRMAR PAGAMENTO
              </div>
            </div>
          </PhoneShell>
          <div className="text-xs font-medium text-bz-muted">2. Confirmar</div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center sm:mt-16">
          <svg className="h-6 w-6 rotate-90 text-bz-border sm:rotate-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.172 12l-4.95-4.95 1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
          </svg>
        </div>

        {/* Step 3: Paid */}
        <div className="flex flex-col items-center gap-3">
          <PhoneShell>
            <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-green-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600 shadow-lg">
                <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-xs font-bold text-green-800">PAGO!</div>
                <div className="text-[10px] text-green-600">2.500 Kz</div>
                <div className="mt-1 text-[9px] text-green-500">Instantaneamente</div>
              </div>
            </div>
          </PhoneShell>
          <div className="text-xs font-medium text-bz-muted">3. Pago instantaneamente</div>
        </div>
      </div>

      {/* Merchant notification */}
      <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">📳</span>
          <div>
            <div className="text-xs font-bold text-green-800">Notificação Comerciante</div>
            <div className="mt-0.5 text-xs text-green-700">
              💰 Recebeu 2.500 Kz de @joao.silva
            </div>
            <div className="mt-1 text-[10px] text-green-500">Agora mesmo · Banzami</div>
          </div>
        </div>
      </div>
    </div>
  )
}
