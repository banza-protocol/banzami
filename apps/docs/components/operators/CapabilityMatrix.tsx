import { CAPABILITY_LABELS, type Operator, type CapabilityMeta } from '@/lib/operators'

const ALL_CAPS = [
  'supports_wallets',
  'supports_qr',
  'supports_settlement',
  'supports_payment_requests',
  'supports_events',
  'supports_traces',
  'supports_webhooks',
  'supports_federation',
  'supports_offline_payments',
  'supports_multi_currency',
  'supports_acquiring',
  'supports_routing',
]

function CellIcon({ supported, meta }: { supported: boolean; meta?: CapabilityMeta }) {
  if (supported) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
        <svg className="h-3 w-3 text-green-600" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (meta === 'experimental') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100">
        <svg className="h-3 w-3 text-amber-600" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v5M6 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (meta === 'planned') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bz-surface">
        <svg className="h-3 w-3 text-bz-muted" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center">
      <span className="h-px w-3 bg-bz-border" />
    </span>
  )
}

interface Props {
  operators: Operator[]
}

export function CapabilityMatrix({ operators }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-bz-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bz-border bg-bz-surface">
            <th className="px-4 py-3 text-left font-semibold text-bz-text text-xs">Capacidade</th>
            {operators.map(op => (
              <th key={op.id} className="px-4 py-3 text-center font-semibold text-bz-text text-xs whitespace-nowrap">
                {op.display_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-bz-border">
          {ALL_CAPS.map(cap => (
            <tr key={cap} className="bg-white hover:bg-bz-bg transition-colors">
              <td className="px-4 py-2.5">
                <span className="font-mono text-[11px] text-bz-muted">{CAPABILITY_LABELS[cap] ?? cap}</span>
              </td>
              {operators.map(op => {
                const supported = (op.capabilities as Record<string, boolean>)[cap] ?? false
                const meta = (op.capabilities_metadata as Record<string, CapabilityMeta>)[cap]
                return (
                  <td key={op.id} className="px-4 py-2.5 text-center">
                    <div className="flex justify-center">
                      <CellIcon supported={supported} meta={meta} />
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-4 border-t border-bz-border bg-bz-surface px-4 py-2.5">
        {[
          { icon: 'bg-green-100 text-green-600', label: 'Suportado', sym: '✓' },
          { icon: 'bg-amber-100 text-amber-600',  label: 'Experimental', sym: '!' },
          { icon: 'bg-bz-surface text-bz-muted',  label: 'Planeado', sym: '○' },
          { icon: '',                              label: 'Indisponível', sym: '—' },
        ].map(({ label, sym, icon }) => (
          <div key={label} className="flex items-center gap-1.5">
            {icon ? (
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${icon}`}>{sym}</span>
            ) : (
              <span className="h-px w-4 bg-bz-border" />
            )}
            <span className="text-[11px] text-bz-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
