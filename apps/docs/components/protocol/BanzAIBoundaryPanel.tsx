const CERTIFIES = [
  'Defines protocol rules (RFCs, ADRs)',
  'Runs authoritative conformance suite',
  'Issues operator certificates',
  'Governs federation rules',
  'Publishes BRL (revocation list)',
]

const EVALUATES = [
  'Prepares operators for conformance',
  'Validates manifests (non-authoritative)',
  'Simulates certification readiness',
  'Explains protocol to operators',
  'Guides operators through certification',
]

export function BanzAIBoundaryPanel() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card p-6">
        <div className="mb-4 text-sm font-bold text-bz-text">BANZA certifies</div>
        <ul className="space-y-2">
          {CERTIFIES.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-bz-muted">
              <span className="mt-0.5 shrink-0 text-bz-primary">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="card border-bz-gold/30 bg-bz-gold-light p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-amber-800">
          <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
            <path d="M6 1l1.2 3.8H11l-3 2.2 1.1 3.6L6 8.3 2.9 10.6 4 7 1 4.8h3.8z" fill="currentColor"/>
          </svg>
          BanzAI evaluates
        </div>
        <ul className="space-y-2">
          {EVALUATES.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-amber-800/70">
              <span className="mt-0.5 shrink-0 text-bz-gold">→</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[10px] text-amber-800/60">
          BanzAI does not hold production keys and does not issue authoritative certificates. ADR-029 §Phase 9.
        </p>
      </div>
    </div>
  )
}
