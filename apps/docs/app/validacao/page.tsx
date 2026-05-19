import type { Metadata } from 'next'
import { getValidationMatrix, computeMetrics } from '@/lib/validation'
import { ValidationDashboard } from '@/components/validation/ValidationDashboard'
import { ValidationMetrics } from '@/components/validation/ValidationMetrics'
import { ArchitectureHealth } from '@/components/validation/ArchitectureHealth'

export const metadata: Metadata = {
  title: 'Validação',
  description:
    'Sistema de execução e validação do ecossistema Banzami — acompanhamento rigoroso da implementação de todas as funcionalidades descritas no documento oficial.',
}

export default function ValidacaoPage() {
  const matrix = getValidationMatrix()
  const metrics = computeMetrics(matrix.items, matrix.categories)

  const donePct =
    metrics.total > 0
      ? Math.round(((metrics.validated + metrics.implemented) / metrics.total) * 100)
      : 0

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-bz-border bg-white px-5 py-10 md:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bz-primary" />
            <span className="text-xs font-semibold text-bz-primary">
              Execução e Validação · v{matrix.meta.referenceVersion}
            </span>
          </div>

          <h1 className="mb-3 text-3xl font-bold tracking-tight text-bz-text sm:text-4xl">
            Execução e Validação do Ecossistema Banzami
          </h1>

          <p className="mb-4 text-base text-bz-muted max-w-2xl">
            Acompanhamento rigoroso da implementação das funcionalidades descritas em{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono text-sm">BANZAMI_REFERENCE.md</code>.
            {' '}Cada item rastreado ao documento de referência oficial.
          </p>

          {/* Governance notice */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-bz-border bg-bz-surface px-3 py-2 text-xs text-bz-muted">
            <svg className="h-3.5 w-3.5 shrink-0 text-bz-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="10" height="8" rx="1.5" />
              <path d="M5.5 6V4.5a2.5 2.5 0 015 0V6" strokeLinecap="round" />
            </svg>
            Consulta pública · edição restrita à administração Banzami
          </div>

          {/* Top-level progress */}
          <div className="mb-8 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-3xl font-bold tabular-nums text-bz-primary">{donePct}%</span>
              <span className="ml-1.5 text-bz-muted">implementação global</span>
            </div>
            <div className="border-l border-bz-border pl-6">
              <span className="text-3xl font-bold tabular-nums text-bz-text">{matrix.items.length}</span>
              <span className="ml-1.5 text-bz-muted">funcionalidades mapeadas</span>
            </div>
            <div className="border-l border-bz-border pl-6">
              <span className="text-3xl font-bold tabular-nums text-bz-text">{matrix.categories.length}</span>
              <span className="ml-1.5 text-bz-muted">categorias</span>
            </div>
          </div>

          {/* Metrics grid */}
          <ValidationMetrics metrics={metrics} />
        </div>
      </div>

      {/* Dashboard (interactive — client component) */}
      <ValidationDashboard
        items={matrix.items}
        categories={matrix.categories}
        metrics={metrics}
      />

      {/* Architecture health */}
      <div className="border-t border-bz-border px-5 py-10 md:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <ArchitectureHealth items={matrix.items} metrics={metrics} />
        </div>
      </div>

      {/* Footer reference */}
      <div className="border-t border-bz-border bg-white px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs text-bz-muted">
            Sistema de execução derivado de{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono">docs/BANZAMI_REFERENCE.md</code>
            {' '}·{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono">docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json</code>
            {' '}· ADR-015
          </p>
          <p className="mt-1 text-xs text-bz-muted">
            Organização Banzami · Última actualização: {matrix.meta.lastUpdated}
          </p>
        </div>
      </div>
    </div>
  )
}
