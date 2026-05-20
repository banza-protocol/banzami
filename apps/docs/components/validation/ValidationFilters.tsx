import type { ValidationStatus, ValidationPriority, ValidationDomain } from '@/lib/validation-types'
import { DOMAIN_LABELS } from '@/lib/validation-types'

const STATUSES: { value: ValidationStatus; label: string; color: string }[] = [
  { value: 'VALIDATED',             label: 'Validada',    color: 'text-green-700 bg-green-50 border-green-200' },
  { value: 'IMPLEMENTED',           label: 'Impl.',       color: 'text-bz-primary bg-bz-primary-light border-bz-primary/30' },
  { value: 'IN_PROGRESS',           label: 'Progresso',   color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'PLANNED',               label: 'Planeada',    color: 'text-bz-muted bg-bz-surface border-bz-border' },
  { value: 'BLOCKED',               label: 'Bloqueada',   color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'FUTURE',                label: 'Roadmap',     color: 'text-violet-700 bg-violet-50 border-violet-200' },
  { value: 'NEEDS_REVIEW',          label: 'Rever',       color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { value: 'REVALIDATION_REQUIRED', label: '↻ Revalidar', color: 'text-orange-700 bg-orange-50 border-orange-200' },
]

const PRIORITIES: { value: ValidationPriority; label: string }[] = [
  { value: 'CRITICAL', label: 'Crítico' },
  { value: 'HIGH',     label: 'Alto' },
  { value: 'MEDIUM',   label: 'Médio' },
  { value: 'LOW',      label: 'Baixo' },
]

const ALL_DOMAINS = Object.keys(DOMAIN_LABELS) as ValidationDomain[]

interface Props {
  search: string
  onSearchChange: (v: string) => void
  activeStatus: ValidationStatus | null
  onStatusChange: (v: ValidationStatus | null) => void
  activePriority: ValidationPriority | null
  onPriorityChange: (v: ValidationPriority | null) => void
  activeDomain: ValidationDomain | null
  onDomainChange: (v: ValidationDomain | null) => void
  resultCount: number
  totalCount: number
}

export function ValidationFilters({
  search, onSearchChange,
  activeStatus, onStatusChange,
  activePriority, onPriorityChange,
  activeDomain, onDomainChange,
  resultCount, totalCount,
}: Props) {
  const hasFilters = !!(activeStatus || activePriority || activeDomain || search)

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bz-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="9" cy="9" r="6" />
          <path d="M15 15l3 3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Pesquisar funcionalidades..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-bz-border bg-white py-2 pl-9 pr-4 text-sm text-bz-text placeholder:text-bz-muted focus:border-bz-primary focus:outline-none focus:ring-1 focus:ring-bz-primary/20"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-bz-muted hover:text-bz-text"
          >
            ×
          </button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => onStatusChange(activeStatus === s.value ? null : s.value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
              activeStatus === s.value
                ? s.color
                : 'border-bz-border bg-white text-bz-muted hover:border-bz-primary/30 hover:text-bz-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Priority + Domain filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-bz-muted">Prioridade:</span>
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            onClick={() => onPriorityChange(activePriority === p.value ? null : p.value)}
            className={`rounded-lg border px-2 py-0.5 font-mono text-[10px] font-bold transition-all ${
              activePriority === p.value
                ? 'border-bz-primary bg-bz-primary text-white'
                : 'border-bz-border bg-white text-bz-muted hover:border-bz-primary/30'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Domain filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-bz-muted">Domínio:</span>
        {ALL_DOMAINS.map((d) => (
          <button
            key={d}
            onClick={() => onDomainChange(activeDomain === d ? null : d)}
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-all ${
              activeDomain === d
                ? 'border-bz-primary bg-bz-primary text-white'
                : 'border-bz-border bg-white text-bz-muted hover:border-bz-primary/30'
            }`}
          >
            {d.replace('DOM-', '')}
          </button>
        ))}
        {activeDomain && (
          <span className="text-[10px] text-bz-muted">— {DOMAIN_LABELS[activeDomain]}</span>
        )}
      </div>

      {/* Results + clear */}
      <div className="flex items-center gap-3">
        <p className="text-[11px] text-bz-muted">
          {resultCount === totalCount
            ? `${totalCount} funcionalidades`
            : `${resultCount} de ${totalCount} funcionalidades`}
        </p>
        {hasFilters && (
          <button
            onClick={() => { onStatusChange(null); onPriorityChange(null); onDomainChange(null); onSearchChange(''); }}
            className="rounded-lg border border-bz-border px-2 py-0.5 text-[10px] text-bz-muted hover:border-bz-primary/30 hover:text-bz-text"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  )
}
