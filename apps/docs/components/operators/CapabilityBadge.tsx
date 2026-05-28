import { CAPABILITY_LABELS, type CapabilityMeta } from '@/lib/operators'

const STATE_CONFIG: Record<CapabilityMeta | 'supported', { label: string; color: string; bg: string; dot: string }> = {
  supported:    { label: '',               color: 'text-green-700',   bg: 'bg-green-50 border border-green-200',   dot: 'bg-green-500' },
  experimental: { label: ' · experimental', color: 'text-amber-700', bg: 'bg-amber-50 border border-amber-200',   dot: 'bg-amber-400' },
  planned:      { label: ' · planned',     color: 'text-bz-muted',    bg: 'bg-bz-surface border border-bz-border', dot: 'bg-bz-border' },
  unavailable:  { label: '',               color: 'text-bz-muted/50', bg: 'bg-bz-surface/50 border border-bz-border/50 opacity-50', dot: 'bg-bz-border' },
}

interface Props {
  capabilityKey: string
  supported: boolean
  meta?: CapabilityMeta
  size?: 'sm' | 'md'
}

export function CapabilityBadge({ capabilityKey, supported, meta, size = 'md' }: Props) {
  const effectiveState: CapabilityMeta | 'supported' = supported ? 'supported' : (meta ?? 'unavailable')
  const cfg = STATE_CONFIG[effectiveState]
  const label = CAPABILITY_LABELS[capabilityKey] ?? capabilityKey

  const Icon = supported ? (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : effectiveState === 'planned' ? (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  ) : effectiveState === 'experimental' ? (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
      <path d="M6 2v5M6 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className="h-3 w-3 shrink-0 opacity-40" viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${cfg.color} ${cfg.bg} ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : ''}`}
      title={`${label}${cfg.label}`}
    >
      {Icon}
      <span>{label}{cfg.label}</span>
    </span>
  )
}
