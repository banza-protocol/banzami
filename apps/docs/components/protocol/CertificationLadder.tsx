const LEVELS = [
  {
    level: 'L0',
    name: 'Sandbox Operator',
    gate: 'Protocol conformance in sandbox environment',
    badge: 'bg-bz-surface text-bz-muted border-bz-border',
  },
  {
    level: 'L1',
    name: 'Payment Operator',
    gate: 'Core payment operations with real wallets and ledger',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    level: 'L2',
    name: 'Settlement Operator',
    gate: 'Bilateral settlement with another certified operator',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    level: 'L3',
    name: 'Federation Operator',
    gate: 'Federation eligibility — cross-operator payment routing',
    badge: 'bg-bz-primary-light text-bz-primary border-bz-primary/20',
    highlight: true,
  },
  {
    level: 'L4',
    name: 'Infrastructure Operator',
    gate: 'Protocol governance participation and infrastructure contribution',
    badge: 'bg-bz-gold-light text-amber-800 border-bz-gold/30',
  },
]

export function CertificationLadder() {
  return (
    <div className="space-y-3">
      {LEVELS.map((lvl) => (
        <div
          key={lvl.level}
          className={`flex items-start gap-4 rounded-xl border p-4 ${
            lvl.highlight ? 'border-bz-primary/20 bg-bz-primary-light' : 'border-bz-border bg-white'
          }`}
        >
          <div className={`shrink-0 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${lvl.badge}`}>
            {lvl.level}
          </div>
          <div>
            <div className="text-sm font-semibold text-bz-text">{lvl.name}</div>
            <div className="mt-0.5 text-xs text-bz-muted">{lvl.gate}</div>
          </div>
          {lvl.level === 'L3' && (
            <div className="ml-auto shrink-0 rounded-full bg-bz-primary px-2.5 py-0.5 text-[10px] font-semibold text-white">
              Federation gate
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
