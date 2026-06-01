const LAYERS = [
  {
    label: 'Operators',
    sub: 'Certified entities that implement the protocol',
    color: 'text-bz-gold',
    border: 'border-bz-gold/30',
    bg: 'bg-bz-gold-light',
  },
  {
    label: 'BanzAI',
    sub: 'Protocol Operating System — evaluates readiness',
    color: 'text-bz-primary',
    border: 'border-bz-primary/20',
    bg: 'bg-bz-primary-light',
    arrow: true,
  },
  {
    label: 'BANZA',
    sub: 'Open financial infrastructure protocol — defines the rules',
    color: 'text-bz-text',
    border: 'border-bz-border',
    bg: 'bg-white',
    arrow: true,
  },
]

export function EcosystemHierarchy() {
  return (
    <div className="mx-auto max-w-md space-y-2">
      {LAYERS.map((layer) => (
        <div key={layer.label}>
          {layer.arrow && (
            <div className="flex justify-center py-1 text-bz-muted text-sm">↑</div>
          )}
          <div className={`rounded-xl border px-6 py-4 ${layer.bg} ${layer.border}`}>
            <div className={`font-bold ${layer.color}`}>{layer.label}</div>
            <div className="text-xs text-bz-muted mt-0.5">{layer.sub}</div>
          </div>
        </div>
      ))}
      <p className="mt-4 text-center text-[11px] text-bz-muted">
        Dependency flows upward only. BANZA never depends on any operator.
      </p>
    </div>
  )
}
