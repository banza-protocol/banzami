import type { ValidationMetrics } from '@/lib/validation-types'

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  VALIDATED:    { label: 'Validadas',    color: 'text-green-700',       bg: 'bg-green-50',       border: 'border-green-200' },
  IMPLEMENTED:  { label: 'Implementadas',color: 'text-bz-primary',      bg: 'bg-bz-primary-light',border: 'border-bz-primary/20' },
  IN_PROGRESS:  { label: 'Progresso',    color: 'text-amber-700',       bg: 'bg-amber-50',       border: 'border-amber-200' },
  PLANNED:      { label: 'Planeadas',    color: 'text-bz-muted',        bg: 'bg-bz-surface',     border: 'border-bz-border' },
  BLOCKED:      { label: 'Bloqueadas',   color: 'text-red-700',         bg: 'bg-red-50',         border: 'border-red-200' },
  FUTURE:       { label: 'Roadmap',      color: 'text-violet-700',      bg: 'bg-violet-50',      border: 'border-violet-200' },
}

interface Props {
  metrics: ValidationMetrics
}

export function ValidationMetrics({ metrics }: Props) {
  const cards = [
    { key: 'total',       value: metrics.total,       label: 'Total',          color: 'text-bz-text',    bg: 'bg-white',           border: 'border-bz-border' },
    { key: 'VALIDATED',   value: metrics.validated,   ...STATUS_LABELS.VALIDATED },
    { key: 'IMPLEMENTED', value: metrics.implemented, ...STATUS_LABELS.IMPLEMENTED },
    { key: 'IN_PROGRESS', value: metrics.inProgress,  ...STATUS_LABELS.IN_PROGRESS },
    { key: 'PLANNED',     value: metrics.planned,     ...STATUS_LABELS.PLANNED },
    { key: 'BLOCKED',     value: metrics.blocked,     ...STATUS_LABELS.BLOCKED },
    { key: 'FUTURE',      value: metrics.future,      ...STATUS_LABELS.FUTURE },
    { key: 'coverage',    value: `${metrics.testCoveragePct}%`, label: 'Cobertura',       color: 'text-bz-muted', bg: 'bg-white', border: 'border-bz-border' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((c) => (
        <div
          key={c.key}
          className={`flex flex-col gap-1 rounded-xl border p-3 ${c.bg} ${c.border}`}
        >
          <span className={`text-2xl font-bold tabular-nums leading-none ${c.color}`}>
            {c.value}
          </span>
          <span className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider ${c.color} opacity-70`}>
            {c.label ?? c.key}
          </span>
        </div>
      ))}
    </div>
  )
}
