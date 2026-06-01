const PROTOCOL_PROPERTIES = [
  {
    label: 'Public rules',
    description:
      'The specification — RFCs, ADRs, conformance suite — is publicly available. No documentation is behind an NDA.',
  },
  {
    label: 'Open certification',
    description:
      'Any legal entity that passes the conformance suite becomes a certified BANZA operator. No bilateral agreement required.',
  },
  {
    label: 'Verifiable invariants',
    description:
      'Financial properties are enforced by the Rust kernel and verifiable by any independent auditor. Instant settlement is a kernel invariant, not a contractual promise.',
  },
  {
    label: 'Federation',
    description:
      'Certified operators can route payments between each other without bilateral agreements, because both implement the same open protocol.',
  },
]

export function ProtocolPropertyGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PROTOCOL_PROPERTIES.map((p) => (
        <div key={p.label} className="card p-6">
          <div className="mb-1 text-sm font-bold text-bz-primary">{p.label}</div>
          <p className="text-sm leading-relaxed text-bz-muted">{p.description}</p>
        </div>
      ))}
    </div>
  )
}
