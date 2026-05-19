const useCases = [
  { icon: '🍽️', label: 'Cantinas',          sub: 'QR estático impresso', color: 'hover:border-bz-primary' },
  { icon: '🚕', label: 'Táxis',              sub: 'Pagamento in-app',     color: 'hover:border-bz-primary' },
  { icon: '🛒', label: 'Ecommerce',          sub: 'Link de pagamento',    color: 'hover:border-bz-primary' },
  { icon: '❤️', label: 'Doações',            sub: 'QR para doadores',    color: 'hover:border-bz-primary' },
  { icon: '🏫', label: 'Escolas',            sub: 'Propinas e taxas',     color: 'hover:border-bz-primary' },
  { icon: '🛵', label: 'Delivery',           sub: 'Pagamento na entrega', color: 'hover:border-bz-primary' },
  { icon: '💇', label: 'Salões / Serviços', sub: 'QR no balcão',         color: 'hover:border-bz-primary' },
  { icon: '🖥️', label: 'Freelancers',       sub: 'Pedido de pagamento',  color: 'hover:border-bz-primary' },
]

export function QRCommerceVisual() {
  return (
    <div className="my-8 overflow-hidden rounded-3xl border border-bz-border bg-white p-6 shadow-card md:p-8">
      <div className="mb-6 text-center">
        <span className="badge-gold">QR Commerce em Angola</span>
        <p className="mt-2 text-sm text-bz-muted">
          Um QR code. Infinitas possibilidades de pagamento.
        </p>
      </div>

      {/* Central QR node + grid */}
      <div className="flex flex-col items-center gap-6">
        {/* Central node */}
        <div className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl bg-bz-primary text-white shadow-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M14 16h4" strokeLinecap="round" />
          </svg>
          <span className="mt-1 text-[10px] font-bold">BANZA QR</span>
        </div>

        {/* Use case grid */}
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {useCases.map((uc, i) => (
            <div
              key={i}
              className={`group rounded-2xl border border-bz-border bg-bz-bg p-4 text-center transition-all duration-200 hover:shadow-card-md ${uc.color}`}
            >
              <div className="text-2xl">{uc.icon}</div>
              <div className="mt-2 text-xs font-semibold text-bz-text group-hover:text-bz-primary">
                {uc.label}
              </div>
              <div className="mt-0.5 text-[10px] text-bz-muted">{uc.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-bz-muted">
        Todos os pagamentos são liquidados instantaneamente em Kwanza · Sem terminal físico necessário
      </div>
    </div>
  )
}
