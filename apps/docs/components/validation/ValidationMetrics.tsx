import type { ValidationMetrics } from '@/lib/validation-types'

interface Props {
  metrics: ValidationMetrics
}

export function ValidationMetrics({ metrics }: Props) {
  const statusCards = [
    { key: 'total',                value: metrics.total,             label: 'Total',         color: 'text-bz-text',    bg: 'bg-white',            border: 'border-bz-border' },
    { key: 'VALIDATED',            value: metrics.validated,         label: 'Validadas',     color: 'text-green-700',  bg: 'bg-green-50',         border: 'border-green-200' },
    { key: 'IMPLEMENTED',          value: metrics.implemented,       label: 'Implementadas', color: 'text-bz-primary', bg: 'bg-bz-primary-light', border: 'border-bz-primary/20' },
    { key: 'IN_PROGRESS',          value: metrics.inProgress,        label: 'Progresso',     color: 'text-amber-700',  bg: 'bg-amber-50',         border: 'border-amber-200' },
    { key: 'PLANNED',              value: metrics.planned,           label: 'Planeadas',     color: 'text-bz-muted',   bg: 'bg-bz-surface',       border: 'border-bz-border' },
    { key: 'BLOCKED',              value: metrics.blocked,           label: 'Bloqueadas',    color: 'text-red-700',    bg: 'bg-red-50',           border: 'border-red-200' },
    { key: 'FUTURE',               value: metrics.future,            label: 'Roadmap',       color: 'text-violet-700', bg: 'bg-violet-50',        border: 'border-violet-200' },
    { key: 'REVALIDATION',         value: metrics.revalidationRequired, label: 'Revalidar', color: 'text-orange-700', bg: 'bg-orange-50',        border: 'border-orange-200' },
  ]

  const qualityCards = [
    { key: 'coverage',    value: `${metrics.testCoveragePct}%`,         label: 'Cobertura testes',    color: 'text-bz-muted', bg: 'bg-white', border: 'border-bz-border' },
    { key: 'confidence',  value: `${metrics.avgConfidence}`,            label: 'Confiança média',     color: metrics.avgConfidence >= 70 ? 'text-green-700' : metrics.avgConfidence >= 50 ? 'text-amber-700' : 'text-red-700', bg: 'bg-white', border: 'border-bz-border' },
    { key: 'integrity',   value: `${metrics.architectureIntegrityPct}%`, label: 'Integridade arq.',   color: metrics.architectureIntegrityPct >= 80 ? 'text-green-700' : metrics.architectureIntegrityPct >= 50 ? 'text-amber-700' : 'text-red-700', bg: 'bg-white', border: 'border-bz-border' },
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {statusCards.map((c) => (
          <div
            key={c.key}
            className={`flex min-w-[7rem] flex-1 flex-col gap-1 rounded-xl border p-3 ${c.bg} ${c.border}`}
          >
            <span className={`text-2xl font-bold tabular-nums leading-none ${c.color}`}>
              {c.value}
            </span>
            <span className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider ${c.color} opacity-70`}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {qualityCards.map((c) => (
          <div
            key={c.key}
            className={`flex min-w-[10rem] flex-1 flex-col gap-1 rounded-xl border p-3 ${c.bg} ${c.border}`}
          >
            <span className={`text-2xl font-bold tabular-nums leading-none ${c.color}`}>
              {c.value}
            </span>
            <span className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider ${c.color} opacity-70`}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
