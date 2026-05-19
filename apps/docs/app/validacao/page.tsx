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

          <p className="mb-6 text-base text-bz-muted max-w-2xl">
            Acompanhamento rigoroso da implementação das funcionalidades descritas em{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono text-sm">BANZAMI_REFERENCE.md</code>.
            {' '}Cada item rastreado ao documento de referência oficial.
          </p>

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
