import type { ValidationItem, ValidationCategory, ValidationStatus, ValidationPriority, ValidationMethod } from '@/lib/validation-types'
import { ValidationEvidence } from './ValidationEvidence'

const STATUS_CONFIG: Record<ValidationStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  VALIDATED:    { label: 'Validada',      color: 'text-green-700',  bg: 'bg-green-50',        border: 'border-l-green-500',    dot: 'bg-green-500' },
  IMPLEMENTED:  { label: 'Implementada',  color: 'text-bz-primary', bg: 'bg-bz-primary-light',border: 'border-l-bz-primary',   dot: 'bg-bz-primary' },
  IN_PROGRESS:  { label: 'Em progresso',  color: 'text-amber-700',  bg: 'bg-amber-50',        border: 'border-l-amber-400',    dot: 'bg-amber-400' },
  PLANNED:      { label: 'Planeada',      color: 'text-bz-muted',   bg: 'bg-bz-surface',      border: 'border-l-bz-border',    dot: 'bg-bz-border' },
  FUTURE:       { label: 'Roadmap',       color: 'text-violet-700', bg: 'bg-violet-50',       border: 'border-l-violet-400',   dot: 'bg-violet-400' },
  BLOCKED:      { label: 'Bloqueada',     color: 'text-red-700',    bg: 'bg-red-50',          border: 'border-l-red-500',      dot: 'bg-red-500' },
  NEEDS_REVIEW: { label: 'Rever',         color: 'text-orange-700', bg: 'bg-orange-50',       border: 'border-l-orange-400',   dot: 'bg-orange-400' },
}

const PRIORITY_CONFIG: Record<ValidationPriority, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'CRÍTICO', color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  HIGH:     { label: 'ALTO',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  MEDIUM:   { label: 'MÉDIO',   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  LOW:      { label: 'BAIXO',   color: 'text-bz-muted',   bg: 'bg-bz-surface border-bz-border' },
}

const METHOD_LABELS: Record<ValidationMethod, string> = {
  unit_tests:          'Unit Tests',
  integration_tests:   'Integration Tests',
  e2e_tests:           'E2E Tests',
  manual_ux:           'UX Manual',
  financial_invariant: 'Invariante financeiro',
  reconciliation:      'Reconciliação',
  security_audit:      'Auditoria de segurança',
  sandbox:             'Sandbox',
  production_review:   'Revisão de produção',
}

interface Props {
  item: ValidationItem
  category: ValidationCategory | undefined
  isExpanded: boolean
  onToggle: () => void
}

export function ValidationCard({ item, category, isExpanded, onToggle }: Props) {
  const status = STATUS_CONFIG[item.status]
  const priority = PRIORITY_CONFIG[item.priority]
  const hasBlockers = item.blockingIssues.length > 0

  return (
    <div className={`overflow-hidden rounded-xl border border-bz-border border-l-4 bg-white shadow-card transition-shadow hover:shadow-card-md ${status.border}`}>
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3.5 text-left"
      >
        <div className="flex items-start gap-3">
          {/* ID */}
          <span className="shrink-0 font-mono text-[10px] font-bold text-bz-muted pt-0.5 w-16">{item.id}</span>

          {/* Title + badges */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {/* Status badge */}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color} ${status.bg}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>

              {/* Priority badge */}
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${priority.color} ${priority.bg}`}>
                {priority.label}
              </span>

              {/* Category */}
              {category && (
                <span className="rounded-md bg-bz-surface px-1.5 py-0.5 text-[10px] text-bz-muted">
                  {category.name}
                </span>
              )}

              {/* Reference */}
              <span className="rounded-md border border-bz-border px-1.5 py-0.5 font-mono text-[10px] text-bz-muted">
                {item.referenceSection}
              </span>
            </div>

            <p className="text-sm font-semibold text-bz-text leading-tight">{item.title}</p>
          </div>

          {/* Expand icon */}
          <span className={`shrink-0 text-bz-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="border-t border-bz-border px-4 pb-4 pt-4 space-y-4">
          {/* Description */}
          <p className="text-sm text-bz-muted">{item.description}</p>

          {/* Requirement */}
          <div>
            <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-bz-muted">Requisito</h4>
            <p className="text-sm text-bz-text">{item.requirement}</p>
          </div>

          {/* Blocking issues */}
          {hasBlockers && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700">Bloqueantes</h4>
              <ul className="space-y-0.5">
                {item.blockingIssues.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-red-800">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Two-column: acceptance criteria + validation methods */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-bz-muted">Critérios de aceitação</h4>
              <ul className="space-y-1">
                {item.acceptanceCriteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-bz-text">
                    <span className="mt-0.5 shrink-0 text-bz-border">◦</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-bz-muted">Métodos de validação</h4>
              <div className="flex flex-wrap gap-1">
                {item.validationMethods.map((m) => (
                  <span key={m} className="rounded-md bg-bz-surface border border-bz-border px-1.5 py-0.5 text-[10px] text-bz-muted">
                    {METHOD_LABELS[m]}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Evidence */}
          <div>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-bz-muted">
              Evidência
              {item.evidence.length === 0 && item.status === 'VALIDATED' && (
                <span className="ml-2 text-red-600 normal-case">— VALIDADA sem evidência</span>
              )}
            </h4>
            <ValidationEvidence evidence={item.evidence} />
          </div>

          {/* Dependencies */}
          {item.dependencies.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-bz-muted">Dependências</h4>
              <div className="flex flex-wrap gap-1">
                {item.dependencies.map((dep) => (
                  <span key={dep} className="rounded-md border border-bz-border bg-bz-surface px-2 py-0.5 font-mono text-[10px] text-bz-muted">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <p className="rounded-xl border border-bz-gold/30 bg-bz-gold-light px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Nota: </span>{item.notes}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-bz-border pt-2">
            <span className="text-[10px] text-bz-muted">
              {item.ownerArea}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-bz-muted font-mono">{item.technicalArea}</span>
              <span className="text-[10px] text-bz-border">·</span>
              <span className="text-[10px] text-bz-muted">{item.lastUpdated}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
