const TRUST_LAYERS = [
  { label: 'Root Key', sub: 'Air-gapped ceremony · Signs Key Manifests only · INV-ROOT-001–005', top: true },
  { label: 'Key Manifest', sub: '/.well-known/banza/key-manifest.json · Root-signed · 90-day cert window' },
  { label: 'Cert-Issuing Key', sub: 'Signs operator certificates · Online · Rotatable' },
  { label: 'Operator Certificate', sub: '/.well-known/banza/certificate.json · ed25519 · BANZA Revocation List enforced' },
]

export function TrustArchitecturePreview() {
  return (
    <div className="space-y-1.5">
      {TRUST_LAYERS.map((layer, i) => (
        <div key={layer.label}>
          <div className={`rounded-xl border px-5 py-3.5 ${layer.top ? 'border-bz-primary/20 bg-bz-primary-light' : 'border-bz-border bg-white'}`}>
            <div className={`text-sm font-bold ${layer.top ? 'text-bz-primary' : 'text-bz-text'}`}>{layer.label}</div>
            <div className="mt-0.5 text-xs text-bz-muted">{layer.sub}</div>
          </div>
          {i < TRUST_LAYERS.length - 1 && (
            <div className="flex justify-center py-0.5 text-bz-muted text-xs">↓ signs</div>
          )}
        </div>
      ))}
    </div>
  )
}
