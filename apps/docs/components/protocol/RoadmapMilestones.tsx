const MILESTONES = [
  {
    id: 'M1',
    title: 'Protocol Kernel',
    status: 'complete' as const,
    date: '2026-06-01',
    items: [
      'Double-entry ledger (Rust kernel)',
      'Wallet engine + balance invariants',
      'Federation protocol (ADR-026) — 79/79 tests',
      'Certification framework L0–L4 (ADR-028)',
      'Trust architecture (ADR-029) — 4-layer PKI',
      'BanzAI Protocol OS (14 modules)',
      'Conformance suite — 14/14 interop scenarios',
    ],
  },
  {
    id: 'M2',
    title: 'Production Deployment',
    status: 'active' as const,
    date: '2026 Q3',
    items: [
      'Root key ceremony (air-gapped)',
      'First operator certification',
      'Live federation endpoint',
      'Production BanzAI model backend',
    ],
  },
  {
    id: 'M3',
    title: 'Open Ecosystem',
    status: 'next' as const,
    date: '2026 Q4',
    items: [
      'Third-party operator onboarding',
      'RFC-0008 federation discovery',
      'L4 infrastructure operator support',
      'Multi-operator federation graph',
    ],
  },
]

const STATUS = {
  complete: { label: 'M1 Complete', dot: 'bg-green-500', badge: 'border-green-200 bg-green-50 text-green-700' },
  active:   { label: 'Active',      dot: 'bg-bz-primary animate-pulse-slow', badge: 'border-bz-primary/20 bg-bz-primary-light text-bz-primary' },
  next:     { label: 'Next',        dot: 'bg-bz-border', badge: 'border-bz-border bg-bz-surface text-bz-muted' },
}

export function RoadmapMilestones() {
  return (
    <div className="space-y-4">
      {MILESTONES.map((m) => {
        const cfg = STATUS[m.status]
        return (
          <div
            key={m.id}
            className={`rounded-2xl border p-6 ${
              m.status === 'active' ? 'border-bz-primary/20 bg-bz-primary-light' : 'border-bz-border bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  <span className="text-base font-bold text-bz-text">
                    {m.id} — {m.title}
                  </span>
                </div>
                <div className="mt-0.5 pl-5 text-xs text-bz-muted">{m.date}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <ul className="mt-4 space-y-1 pl-5">
              {m.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-bz-muted">
                  <span className={`mt-0.5 shrink-0 ${m.status === 'complete' ? 'text-green-600' : 'text-bz-border'}`}>
                    {m.status === 'complete' ? '✓' : '○'}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
