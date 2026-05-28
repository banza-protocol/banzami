import Link from 'next/link'
import { CertificationLevelBadge, ConformanceBadgeChip } from './ConformanceBadge'
import { CapabilityBadge } from './CapabilityBadge'
import { OPERATOR_TYPE_LABELS, type Operator, type CapabilityMeta } from '@/lib/operators'

const ENV_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  sandbox:      { label: 'Sandbox',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  production:   { label: 'Produção',     color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  experimental: { label: 'Experimental', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
}

const STATUS_DOT: Record<string, string> = {
  active:       'bg-green-500',
  experimental: 'bg-amber-400',
  deprecated:   'bg-bz-muted',
  offline:      'bg-red-500',
}

interface Props {
  operator: Operator
}

const KEY_CAPS = ['supports_wallets', 'supports_qr', 'supports_settlement', 'supports_traces', 'supports_federation']

export function OperatorCard({ operator }: Props) {
  const env = ENV_CONFIG[operator.environment] ?? ENV_CONFIG.sandbox
  const statusDot = STATUS_DOT[operator.status] ?? 'bg-bz-border'

  return (
    <Link
      href={`/operators/${operator.id}`}
      className="group block rounded-2xl border border-bz-border bg-white p-5 shadow-card transition-all hover:shadow-card-md hover:border-bz-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bz-primary"
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex h-2 w-2 rounded-full ${statusDot}`} />
            <span className="text-base font-bold tracking-tight text-bz-text group-hover:text-bz-primary transition-colors truncate">
              {operator.display_name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${env.color} ${env.bg}`}>
              {env.label}
            </span>
            <span className="text-[11px] text-bz-muted">
              {OPERATOR_TYPE_LABELS[operator.type] ?? operator.type}
            </span>
            <span className="text-[11px] text-bz-muted/60">·</span>
            <span className="text-[11px] text-bz-muted">{operator.jurisdiction}</span>
          </div>
        </div>
        <CertificationLevelBadge level={operator.certification_level} />
      </div>

      {/* Description */}
      <p className="mb-4 text-[13px] leading-relaxed text-bz-muted line-clamp-2">
        {operator.description}
      </p>

      {/* Conformance badges */}
      {operator.conformance_badges.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {operator.conformance_badges.map(badge => (
            <ConformanceBadgeChip key={badge} badge={badge} />
          ))}
        </div>
      )}

      {/* Key capabilities */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {KEY_CAPS.map(cap => {
          const supported = (operator.capabilities as Record<string, boolean>)[cap] ?? false
          const meta = (operator.capabilities_metadata as Record<string, CapabilityMeta>)[cap]
          if (!supported && !meta) return null
          return (
            <CapabilityBadge
              key={cap}
              capabilityKey={cap}
              supported={supported}
              meta={meta}
              size="sm"
            />
          )
        })}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between border-t border-bz-border pt-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-bz-muted">v{operator.protocol_version}</span>
          <span className="text-bz-muted/40">·</span>
          <span className="font-mono text-[11px] text-bz-muted">
            {operator.supported_currencies.join(', ')}
          </span>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-medium text-bz-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Ver perfil
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
