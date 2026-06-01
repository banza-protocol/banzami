const STEPS = [
  {
    step: '01',
    actor: 'BANZA',
    action: 'defines the rules',
    detail: 'RFCs, ADRs, conformance suite, financial invariants. The open specification any operator can implement.',
  },
  {
    step: '02',
    actor: 'BanzAI',
    action: 'evaluates readiness',
    detail: 'The Protocol Operating System — validates manifests, simulates certification, measures conformance.',
  },
  {
    step: '03',
    actor: 'Operators',
    action: 'implement the protocol',
    detail: 'Any certified entity processes payments under BANZA rules. Each operator builds its own product and experience.',
  },
  {
    step: '04',
    actor: 'Federation',
    action: 'connects operators',
    detail: 'Certified L3+ operators route payments across networks without bilateral agreements. One protocol, any operator.',
  },
]

export function HowItWorks() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {STEPS.map((s, i) => (
        <div key={s.step} className="card p-6">
          <div className="mb-3 font-mono text-[11px] font-semibold text-bz-muted">{s.step}</div>
          <div className="mb-1 text-sm">
            <span className="font-bold text-bz-primary">{s.actor}</span>
            {' '}
            <span className="text-bz-text">{s.action}</span>
          </div>
          <p className="text-xs leading-relaxed text-bz-muted">{s.detail}</p>
          {i < STEPS.length - 1 && (
            <div className="mt-3 flex items-center gap-1 text-[10px] font-medium text-bz-border">
              <span className="flex-1 border-t border-dashed border-bz-border" />
              <span>↓</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
