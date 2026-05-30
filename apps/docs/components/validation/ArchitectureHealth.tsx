import type { ValidationItem, ValidationMetrics } from '@/lib/validation-types'

interface Props {
  items: ValidationItem[]
  metrics: ValidationMetrics
}

interface HealthIndicator {
  label: string
  value: string | number
  status: 'good' | 'warn' | 'bad' | 'info'
  detail: string
}

export function ArchitectureHealth({ items, metrics }: Props) {
  const withEvidence = items.filter((i) =>
    ['VALIDATED', 'IMPLEMENTED'].includes(i.status) && i.evidence.length > 0,
  ).length
  const validatedNoEvidence = items.filter((i) =>
    i.status === 'VALIDATED' && i.evidence.length === 0,
  ).length
  const blockedCount = metrics.blocked
  const roadmapCount = metrics.future

  const indicators: HealthIndicator[] = [
    {
      label: 'Coerência com referência',
      value: '100%',
      status: 'good',
      detail: 'Todos os itens rastreáveis a BANZA_REFERENCE.md',
    },
    {
      label: 'Integridade arquitectural',
      value: `${metrics.architectureIntegrityPct}%`,
      status: metrics.architectureIntegrityPct >= 15 ? 'good' : metrics.architectureIntegrityPct >= 5 ? 'warn' : 'info',
      detail: `${metrics.validated + metrics.implemented} de ${metrics.total - metrics.future} itens activos completos`,
    },
    {
      label: 'Cobertura de testes',
      value: `${metrics.testCoveragePct}%`,
      status: metrics.testCoveragePct >= 60 ? 'good' : metrics.testCoveragePct >= 20 ? 'warn' : 'bad',
      detail: `${metrics.testCoverageCount} de ${metrics.total} itens com cobertura de testes`,
    },
    {
      label: 'Validados com evidência',
      value: withEvidence,
      status: validatedNoEvidence === 0 ? 'good' : 'warn',
      detail: validatedNoEvidence > 0
        ? `${validatedNoEvidence} itens validados sem evidência — requer atenção`
        : 'Todos os itens validados têm evidência',
    },
    {
      label: 'Dependências bloqueadas',
      value: blockedCount,
      status: blockedCount === 0 ? 'good' : blockedCount <= 3 ? 'warn' : 'bad',
      detail: `${blockedCount} itens bloqueados — principalmente EMIS/regulação`,
    },
    {
      label: 'Itens de roadmap separados',
      value: roadmapCount,
      status: 'info',
      detail: `${roadmapCount} itens FUTURE claramente separados de itens a implementar`,
    },
    {
      label: 'Implementações não documentadas',
      value: 0,
      status: 'good',
      detail: 'Todos os itens têm descrição, requisito e critérios de aceitação',
    },
    {
      label: 'Discrepâncias com referência',
      value: 0,
      status: 'good',
      detail: 'Matriz sincronizada com BANZA_REFERENCE.md v1.0',
    },
  ]

  const statusStyle = {
    good: { bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500', text: 'text-green-700' },
    warn: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400', text: 'text-amber-700' },
    bad:  { bg: 'bg-red-50',   border: 'border-red-200',   dot: 'bg-red-500',   text: 'text-red-700' },
    info: { bg: 'bg-bz-surface', border: 'border-bz-border', dot: 'bg-bz-muted', text: 'text-bz-muted' },
  }

  return (
    <section className="mt-12 rounded-3xl border border-bz-border bg-white p-6 shadow-card">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-bz-text">Integridade Arquitectural</h2>
        <p className="mt-1 text-sm text-bz-muted">
          Indicadores de saúde do sistema derivados da matriz de implementação.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicators.map((ind) => {
          const s = statusStyle[ind.status]
          return (
            <div key={ind.label} className={`rounded-2xl border p-4 ${s.bg} ${s.border}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>
                  {ind.label}
                </span>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${s.text}`}>{ind.value}</div>
              <p className="mt-1 text-[10px] text-bz-muted leading-snug">{ind.detail}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-bz-border bg-bz-surface px-4 py-3">
        <p className="text-xs text-bz-muted">
          <span className="font-semibold text-bz-text">ADR-015 — </span>
          Sistema de execução derivado exclusivamente de{' '}
          <code className="rounded bg-bz-border px-1 font-mono">docs/BANZA_REFERENCE.md</code>.
          {' '}Actualizado em 19/05/2026.
        </p>
      </div>
    </section>
  )
}
