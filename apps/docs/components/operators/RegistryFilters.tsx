'use client'

import { useState, useMemo } from 'react'
import { OperatorCard } from './OperatorCard'
import { CapabilityMatrix } from './CapabilityMatrix'
import { type Operator } from '@/lib/operators'

type ViewMode = 'cards' | 'matrix'

interface Props {
  operators: Operator[]
}

const ENV_OPTIONS = [
  { value: '', label: 'Todos os ambientes' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'production', label: 'Produção' },
  { value: 'experimental', label: 'Experimental' },
]

const LEVEL_OPTIONS = [
  { value: '', label: 'Qualquer nível' },
  { value: '0', label: 'Level 0 — Reference' },
  { value: '1', label: 'Level 1 — Protocol' },
  { value: '2', label: 'Level 2 — Trace' },
  { value: '3', label: 'Level 3 — Federation' },
  { value: '4', label: 'Level 4 — Settlement' },
]

export function RegistryFilters({ operators }: Props) {
  const [query, setQuery] = useState('')
  const [envFilter, setEnvFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [capFilter, setCapFilter] = useState('')
  const [view, setView] = useState<ViewMode>('cards')

  const filtered = useMemo(() => {
    return operators.filter(op => {
      if (query) {
        const q = query.toLowerCase()
        const matches =
          op.display_name.toLowerCase().includes(q) ||
          op.description.toLowerCase().includes(q) ||
          op.jurisdiction.toLowerCase().includes(q) ||
          op.id.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (envFilter && op.environment !== envFilter) return false
      if (levelFilter !== '' && op.certification_level !== parseInt(levelFilter)) return false
      if (capFilter) {
        const capKey = `supports_${capFilter}`
        if (!(op.capabilities as Record<string, boolean>)[capKey]) return false
      }
      return true
    })
  }, [operators, query, envFilter, levelFilter, capFilter])

  return (
    <>
      {/* Search + filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bz-muted" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Pesquisar operadores…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full rounded-lg border border-bz-border bg-white py-2 pl-9 pr-4 text-sm text-bz-text placeholder:text-bz-muted focus:border-bz-primary focus:outline-none focus:ring-1 focus:ring-bz-primary"
          />
        </div>

        {/* Environment filter */}
        <select
          value={envFilter}
          onChange={e => setEnvFilter(e.target.value)}
          className="rounded-lg border border-bz-border bg-white px-3 py-2 text-sm text-bz-text focus:border-bz-primary focus:outline-none focus:ring-1 focus:ring-bz-primary"
        >
          {ENV_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Level filter */}
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="rounded-lg border border-bz-border bg-white px-3 py-2 text-sm text-bz-text focus:border-bz-primary focus:outline-none focus:ring-1 focus:ring-bz-primary"
        >
          {LEVEL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Capability filter */}
        <select
          value={capFilter}
          onChange={e => setCapFilter(e.target.value)}
          className="rounded-lg border border-bz-border bg-white px-3 py-2 text-sm text-bz-text focus:border-bz-primary focus:outline-none focus:ring-1 focus:ring-bz-primary"
        >
          <option value="">Qualquer capacidade</option>
          <option value="qr">QR</option>
          <option value="settlement">Liquidação</option>
          <option value="traces">Rastreabilidade</option>
          <option value="federation">Federação</option>
          <option value="webhooks">Webhooks</option>
        </select>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-bz-border bg-white p-0.5 gap-0.5 ml-auto">
          {(['cards', 'matrix'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === v
                  ? 'bg-bz-primary text-white shadow-sm'
                  : 'text-bz-muted hover:text-bz-text'
              }`}
            >
              {v === 'cards' ? 'Cards' : 'Matriz'}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <p className="mb-4 text-sm text-bz-muted">
        {filtered.length} operador{filtered.length !== 1 ? 'es' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        {(query || envFilter || levelFilter || capFilter) && (
          <button
            onClick={() => { setQuery(''); setEnvFilter(''); setLevelFilter(''); setCapFilter('') }}
            className="ml-2 text-bz-primary hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </p>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-bz-border bg-white py-16 text-center">
          <p className="text-sm text-bz-muted">Nenhum operador corresponde a esses filtros.</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(op => (
            <OperatorCard key={op.id} operator={op} />
          ))}
        </div>
      ) : (
        <CapabilityMatrix operators={filtered} />
      )}
    </>
  )
}
