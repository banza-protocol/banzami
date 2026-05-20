'use client'

import { useState, useMemo } from 'react'
import type {
  ValidationItem,
  ValidationCategory,
  ValidationMetrics,
  ValidationStatus,
  ValidationPriority,
  ValidationDomain,
} from '@/lib/validation-types'
import { ValidationSidebar } from './ValidationSidebar'
import { ValidationFilters } from './ValidationFilters'
import { ValidationCard } from './ValidationCard'

interface Props {
  items: ValidationItem[]
  categories: ValidationCategory[]
  metrics: ValidationMetrics
}

export function ValidationDashboard({ items, categories, metrics }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<ValidationStatus | null>(null)
  const [activePriority, setActivePriority] = useState<ValidationPriority | null>(null)
  const [activeDomain, setActiveDomain] = useState<ValidationDomain | null>(null)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeCategory && item.categoryId !== activeCategory) return false
      if (activeStatus && item.status !== activeStatus) return false
      if (activePriority && item.priority !== activePriority) return false
      if (activeDomain && item.validationDomain !== activeDomain) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.referenceSection.toLowerCase().includes(q) ||
          item.ownerArea.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, activeCategory, activeStatus, activePriority, activeDomain, search])

  function toggleItem(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  )

  // Group filtered items by category for rendering
  const grouped = useMemo(() => {
    if (activeCategory) {
      return [{ categoryId: activeCategory, categoryItems: filtered }]
    }
    const seen = new Set<string>()
    const order: string[] = []
    for (const item of filtered) {
      if (!seen.has(item.categoryId)) {
        seen.add(item.categoryId)
        order.push(item.categoryId)
      }
    }
    return order.map((catId) => ({
      categoryId: catId,
      categoryItems: filtered.filter((i) => i.categoryId === catId),
    }))
  }, [filtered, activeCategory])

  return (
    <div className="flex min-h-[60vh] gap-0">
      {/* Category sidebar */}
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-bz-border bg-white px-3 py-5 lg:block xl:w-60">
        <ValidationSidebar
          categories={categories}
          items={items}
          byCategory={metrics.byCategory}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
      </aside>

      {/* Main area */}
      <div className="min-w-0 flex-1 px-5 py-6 md:px-8">
        {/* Filters */}
        <ValidationFilters
          search={search}
          onSearchChange={setSearch}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          activePriority={activePriority}
          onPriorityChange={setActivePriority}
          activeDomain={activeDomain}
          onDomainChange={setActiveDomain}
          resultCount={filtered.length}
          totalCount={items.length}
        />

        {/* Items list grouped by category */}
        <div className="mt-6 space-y-8">
          {grouped.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 text-3xl text-bz-border">◎</div>
              <p className="text-sm font-semibold text-bz-muted">Nenhuma funcionalidade encontrada</p>
              <p className="mt-1 text-xs text-bz-muted">Tente ajustar os filtros ou a pesquisa</p>
            </div>
          )}

          {grouped.map(({ categoryId, categoryItems }) => {
            const cat = categoryMap[categoryId]
            return (
              <section key={categoryId}>
                {/* Category header (only when showing multiple categories) */}
                {!activeCategory && cat && (
                  <div className="mb-3 flex items-center gap-3">
                    <h3 className="text-sm font-bold text-bz-text">{cat.name}</h3>
                    <span className="rounded-full bg-bz-surface px-2 py-0.5 font-mono text-[10px] text-bz-muted">
                      {categoryItems.length}
                    </span>
                    <div className="flex-1 border-t border-bz-border" />
                  </div>
                )}

                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <ValidationCard
                      key={item.id}
                      item={item}
                      category={categoryMap[item.categoryId]}
                      isExpanded={expandedIds.has(item.id)}
                      onToggle={() => toggleItem(item.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
