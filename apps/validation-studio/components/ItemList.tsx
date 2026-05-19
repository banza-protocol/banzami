'use client'

import type { ValidationItem, ValidationStatus, ValidationPriority } from '@/lib/types'
import { ALL_STATUSES, ALL_PRIORITIES, FINANCIAL_CRITICAL_CATEGORIES } from '@/lib/types'
import { getRequiresBlockers } from '@/lib/governance'

const STATUS_COLORS: Record<ValidationStatus, { dot: string; badge: string }> = {
  VALIDATED:    { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  IMPLEMENTED:  { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700' },
  IN_PROGRESS:  { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700' },
  PLANNED:      { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600' },
  FUTURE:       { dot: 'bg-slate-300',   badge: 'bg-slate-50 text-slate-500' },
  BLOCKED:      { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700' },
  NEEDS_REVIEW: { dot: 'bg-purple-500',  badge: 'bg-purple-50 text-purple-700' },
}

const PRIORITY_COLORS: Record<ValidationPriority, string> = {
  CRITICAL: 'text-red-600',
  HIGH:     'text-amber-600',
  MEDIUM:   'text-slate-500',
  LOW:      'text-slate-400',
}

const STATUS_LABELS: Record<ValidationStatus, string> = {
  VALIDATED:    'Validado',
  IMPLEMENTED:  'Implementado',
  IN_PROGRESS:  'Em curso',
  PLANNED:      'Planeado',
  FUTURE:       'Futuro',
  BLOCKED:      'Bloqueado',
  NEEDS_REVIEW: 'Em revisão',
}

interface Props {
  items: ValidationItem[]
  allItems: ValidationItem[]
  selectedId: string | null
  search: string
  filterStatus: ValidationStatus | null
  filterPriority: ValidationPriority | null
  onSearchChange: (v: string) => void
  onStatusChange: (v: ValidationStatus | null) => void
  onPriorityChange: (v: ValidationPriority | null) => void
  onSelect: (id: string) => void
}

const LOCK_ICON = (
  <svg className="h-3 w-3 shrink-0 text-red-400" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1a4 4 0 014 4v1.5h1a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-7a1 1 0 011-1h1V5a4 4 0 014-4zm0 9a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-7a2 2 0 00-2 2v1.5h4V5a2 2 0 00-2-2z" />
  </svg>
)

export function ItemList({
  items,
  allItems,
  selectedId,
  search,
  filterStatus,
  filterPriority,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onSelect,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-bz-border bg-white px-4 py-2">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bz-muted"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="6.5" cy="6.5" r="4" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar…"
            className="w-full rounded-md border border-bz-border bg-bz-surface py-1.5 pl-8 pr-3 text-sm text-bz-text placeholder-bz-muted outline-none focus:border-bz-primary focus:ring-1 focus:ring-bz-primary/20"
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus ?? ''}
          onChange={(e) => onStatusChange((e.target.value as ValidationStatus) || null)}
          className="rounded-md border border-bz-border bg-bz-surface py-1.5 pl-2 pr-7 text-xs text-bz-text outline-none focus:border-bz-primary"
        >
          <option value="">Todos os estados</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={filterPriority ?? ''}
          onChange={(e) => onPriorityChange((e.target.value as ValidationPriority) || null)}
          className="rounded-md border border-bz-border bg-bz-surface py-1.5 pl-2 pr-7 text-xs text-bz-text outline-none focus:border-bz-primary"
        >
          <option value="">Todas as prioridades</option>
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <span className="ml-auto shrink-0 text-xs text-bz-muted">
          {items.length} / {allItems.length}
        </span>
      </div>

      {/* List */}
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-bz-muted">
            Nenhum item corresponde aos filtros
          </div>
        ) : (
          items.map((item) => {
            const sc = STATUS_COLORS[item.status]
            const isSelected = item.id === selectedId
            const missingEvidence =
              ['VALIDATED', 'IMPLEMENTED'].includes(item.status) && item.evidence.length === 0

            const requiresBlockers = getRequiresBlockers(item, allItems)
            const isLocked = requiresBlockers.length > 0
            const isFinancial = FINANCIAL_CRITICAL_CATEGORIES.has(item.categoryId)
            const hasFailingInvariants = (item.invariants ?? []).some(inv => inv.status === 'FAIL')
            const hasUnrunInvariants = isFinancial && (item.invariants ?? []).some(inv => inv.status === 'NOT_RUN')
            const historyCount = (item.history ?? []).length

            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`w-full border-b border-bz-border px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? 'bg-bz-primary-light'
                    : 'bg-white hover:bg-bz-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Status dot */}
                  <div className="mt-1.5 shrink-0">
                    <div className={`h-2 w-2 rounded-full ${sc.dot}`} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-bz-muted">{item.id}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${sc.badge}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                      {isFinancial && (
                        <span className="shrink-0 rounded bg-bz-primary-light px-1.5 py-0.5 text-[10px] font-bold text-bz-primary">∑</span>
                      )}
                      {isLocked && LOCK_ICON}
                      {missingEvidence && (
                        <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          sem evidência
                        </span>
                      )}
                      {hasFailingInvariants && (
                        <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          inv. FAIL
                        </span>
                      )}
                      {hasUnrunInvariants && !hasFailingInvariants && (
                        <span className="shrink-0 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                          inv. pendente
                        </span>
                      )}
                      {item.status === 'BLOCKED' && (
                        <span className="shrink-0 text-[10px] text-red-500">
                          {item.blockingIssues.length} bloqueio{item.blockingIssues.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {historyCount > 0 && (
                        <span className="shrink-0 font-mono text-[10px] text-bz-muted">
                          ⏱ {historyCount}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 truncate text-sm font-medium ${isSelected ? 'text-bz-primary' : 'text-bz-text'}`}>
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-bz-muted">
                      <span className={`font-semibold ${PRIORITY_COLORS[item.priority]}`}>
                        {item.priority}
                      </span>
                      <span>·</span>
                      <span className="truncate">{item.ownerArea}</span>
                      {item.dependencies.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{item.dependencies.length} dep.</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  {isSelected && (
                    <svg
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-bz-primary"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
