import type { ValidationCategory, ValidationItem, CategoryMetrics } from '@/lib/validation-types'
import { ValidationProgress } from './ValidationProgress'

interface Props {
  categories: ValidationCategory[]
  items: ValidationItem[]
  byCategory: CategoryMetrics[]
  activeCategory: string | null
  onCategoryChange: (id: string | null) => void
}

export function ValidationSidebar({ categories, items, byCategory, activeCategory, onCategoryChange }: Props) {
  const totalItems = items.length
  const totalDone = items.filter((i) => ['VALIDATED', 'IMPLEMENTED'].includes(i.status)).length
  const totalPct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="mb-3 px-2">
        <div className="text-[9px] font-bold uppercase tracking-widest text-bz-muted mb-2">Progresso global</div>
        <ValidationProgress value={totalPct} color="primary" size="md" showLabel />
        <div className="mt-1 text-[10px] text-bz-muted">{totalDone} de {totalItems} completas</div>
      </div>

      <div className="my-2 border-t border-bz-border" />

      <button
        onClick={() => onCategoryChange(null)}
        className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm transition-all duration-150 ${
          activeCategory === null
            ? 'bg-bz-primary-light font-semibold text-bz-primary'
            : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
        }`}
      >
        <span>Todas as categorias</span>
        <span className="font-mono text-[10px]">{totalItems}</span>
      </button>

      <div className="mt-1 mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-bz-muted">
        Por categoria
      </div>

      {categories.map((cat) => {
        const m = byCategory.find((b) => b.categoryId === cat.id)
        const active = activeCategory === cat.id
        return (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(active ? null : cat.id)}
            className={`flex flex-col gap-1 rounded-xl px-2.5 py-2 text-left transition-all duration-150 ${
              active
                ? 'bg-bz-primary-light text-bz-primary'
                : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium leading-tight line-clamp-1 ${active ? 'font-semibold' : ''}`}>
                {cat.name}
              </span>
              <span className={`shrink-0 font-mono text-[10px] ml-1 ${active ? 'text-bz-primary' : 'text-bz-border'}`}>
                {m?.total ?? 0}
              </span>
            </div>
            {m && m.total > 0 && (
              <ValidationProgress
                value={m.completionPct}
                color={active ? 'primary' : 'muted'}
                size="sm"
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
