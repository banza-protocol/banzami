'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getGraphStats, getGraphNode, searchGraph, type GraphNodeClient, type GraphNeighbourClient, type GraphStatsResponse } from '@/lib/banzamia-client'

const NODE_TYPE_COLOR: Record<string, string> = {
  rfc:                 '#990011',
  adr:                 '#2A3A8C',
  openapi:             '#0E7490',
  conformance_vector:  '#C89B3C',
  certification_rule:  '#7C3AED',
  invariant:           '#B45309',
  manifest_schema:     '#047857',
  sdk_doc:             '#6B21A8',
  architecture_doc:    '#374151',
  glossary_term:       '#6B7280',
}

const NODE_TYPE_LABEL: Record<string, string> = {
  rfc:                'RFC',
  adr:                'ADR',
  openapi:            'OpenAPI',
  conformance_vector: 'Conformance',
  certification_rule: 'Certification',
  invariant:          'Invariant',
  manifest_schema:    'Schema',
  sdk_doc:            'SDK',
  architecture_doc:   'Architecture',
  glossary_term:      'Glossary',
}

const REL_COLOR: Record<string, string> = {
  IMPLEMENTS:  '#990011',
  SUPERSEDES:  '#B45309',
  REQUIRES:    '#7C3AED',
  VALIDATES:   '#C89B3C',
  REFERENCES:  '#6B7280',
  EXPLAINS:    '#0E7490',
  DEPENDS_ON:  '#374151',
  RELATED_TO:  '#9CA3AF',
}

type ViewMode = 'list' | 'detail'

export function GraphExplorerModule() {
  const [stats, setStats] = useState<GraphStatsResponse | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GraphNodeClient[]>([])
  const [selected, setSelected] = useState<{ node: GraphNodeClient; neighbours: GraphNeighbourClient[] } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getGraphStats().then(s => {
      setStats(s)
      if (s) triggerSearch('')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSearch = useCallback(async (q: string) => {
    setSearchLoading(true)
    const res = await searchGraph(q || ' ')
    setResults(res.nodes)
    setSearchLoading(false)
  }, [])

  const handleSearch = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => triggerSearch(value), 300)
  }

  const handleSelect = async (node: GraphNodeClient) => {
    setLoading(true)
    setViewMode('detail')
    const detail = await getGraphNode(node.id)
    if (detail) setSelected(detail)
    else setSelected({ node, neighbours: [] })
    setLoading(false)
  }

  const filtered = typeFilter === 'all' ? results : results.filter(n => n.type === typeFilter)

  const allTypes = stats
    ? Object.keys(stats.nodes_by_type).sort((a, b) => (stats.nodes_by_type[b] ?? 0) - (stats.nodes_by_type[a] ?? 0))
    : []

  return (
    <div className="flex h-full bg-bia-bg">
      {/* LEFT PANEL — search + list */}
      <div className="flex h-full w-80 shrink-0 flex-col border-r border-bia-border">
        {/* Header */}
        <div className="border-b border-bia-border bg-bia-surface px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-bia-text">Protocol Graph</h2>
            {stats && (
              <span className="text-[10px] text-bia-muted bg-bia-surface-2 rounded-full px-2 py-0.5 border border-bia-border">
                {stats.node_count} nodes · {stats.edge_count} edges
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-bia-muted-2" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search nodes…"
              className="w-full rounded-lg border border-bia-border bg-bia-surface-2 pl-8 pr-3 py-1.5 text-sm text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
            />
          </div>

          {/* Type filter chips */}
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setTypeFilter('all')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                typeFilter === 'all' ? 'bg-bia-primary text-white border-bia-primary' : 'border-bia-border text-bia-muted hover:border-bia-primary/40'
              }`}
            >
              All
            </button>
            {allTypes.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                  typeFilter === t ? 'text-white border-transparent' : 'border-bia-border text-bia-muted hover:border-bia-primary/40'
                }`}
                style={typeFilter === t ? { backgroundColor: NODE_TYPE_COLOR[t] ?? '#6B7280' } : {}}
              >
                {NODE_TYPE_LABEL[t] ?? t} {stats?.nodes_by_type[t] ? `(${stats.nodes_by_type[t]})` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto">
          {searchLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-bia-border border-t-bia-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-bia-muted">No nodes found</div>
          ) : (
            filtered.map(node => (
              <button
                key={node.id}
                onClick={() => handleSelect(node)}
                className={`w-full border-b border-bia-border px-4 py-3 text-left transition-colors hover:bg-bia-surface ${
                  selected?.node.id === node.id ? 'bg-bia-primary-glow' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white"
                    style={{ backgroundColor: NODE_TYPE_COLOR[node.type] ?? '#6B7280' }}
                  >
                    {NODE_TYPE_LABEL[node.type] ?? node.type}
                  </span>
                  <span className="text-[10px] text-bia-muted truncate font-mono">{node.id.split(':')[1] ?? node.id}</span>
                  <span className={`ml-auto shrink-0 text-[9px] font-medium ${
                    node.status === 'accepted' || node.status === 'active' ? 'text-bia-green' : 'text-bia-amber'
                  }`}>
                    {node.status?.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm font-medium text-bia-text truncate">{node.title}</div>
                <div className="mt-0.5 text-xs text-bia-muted truncate">{node.summary?.slice(0, 80)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL — node detail */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'list' || (!selected && !loading) ? (
          <EmptyState stats={stats} />
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-bia-border border-t-bia-primary" />
          </div>
        ) : selected ? (
          <NodeDetail node={selected.node} neighbours={selected.neighbours} onNavigate={handleSelect} />
        ) : null}
      </div>
    </div>
  )
}

function EmptyState({ stats }: { stats: GraphStatsResponse | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bia-surface-2 border border-bia-border">
        <svg className="h-8 w-8 text-bia-muted-2" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="19" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="19" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="7.4" y1="10.9" x2="16.6" y2="7.1" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="7.4" y1="13.1" x2="16.6" y2="16.9" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      </div>
      <div>
        <div className="text-base font-bold text-bia-text">Protocol Graph Explorer</div>
        <div className="mt-1 text-sm text-bia-muted max-w-xs">
          Select any node to inspect its relationships, authority, and connected protocol documents.
        </div>
      </div>
      {stats && (
        <div className="flex gap-4 mt-2">
          {Object.entries(stats.nodes_by_type).map(([type, count]) => (
            <div key={type} className="text-center">
              <div className="text-lg font-bold" style={{ color: NODE_TYPE_COLOR[type] ?? '#6B7280' }}>{count}</div>
              <div className="text-[10px] text-bia-muted">{NODE_TYPE_LABEL[type] ?? type}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NodeDetail({
  node,
  neighbours,
  onNavigate,
}: {
  node: GraphNodeClient
  neighbours: GraphNeighbourClient[]
  onNavigate: (n: GraphNodeClient) => void
}) {
  const outbound = neighbours.filter(n => n.direction === 'outbound')
  const inbound  = neighbours.filter(n => n.direction === 'inbound')

  const authorityPct = Math.round(node.authority * 100)

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-5">
      {/* Node header */}
      <div className="rounded-xl border border-bia-border bg-bia-surface p-5">
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold uppercase text-white"
            style={{ backgroundColor: NODE_TYPE_COLOR[node.type] ?? '#6B7280' }}
          >
            {NODE_TYPE_LABEL[node.type] ?? node.type}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-bia-text leading-tight">{node.title}</h3>
            <div className="mt-1 font-mono text-xs text-bia-muted-2">{node.id}</div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold border ${
            node.status === 'accepted' || node.status === 'active'
              ? 'bg-bia-green/10 text-bia-green border-bia-green/30'
              : 'bg-bia-amber/10 text-bia-amber border-bia-amber/30'
          }`}>
            {node.status?.toUpperCase()}
          </span>
        </div>

        {node.summary && (
          <p className="mt-3 text-sm text-bia-muted leading-relaxed">{node.summary}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-bia-surface-2 border border-bia-border px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2 mb-1">Authority</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-bia-border overflow-hidden">
                <div className="h-full rounded-full bg-bia-primary" style={{ width: `${authorityPct}%` }} />
              </div>
              <span className="text-sm font-bold text-bia-primary">{node.authority.toFixed(2)}</span>
            </div>
          </div>
          <div className="rounded-lg bg-bia-surface-2 border border-bia-border px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2 mb-1">Source Path</div>
            <div className="text-xs font-mono text-bia-text truncate">{node.path}</div>
          </div>
        </div>
      </div>

      {/* Relationships */}
      {neighbours.length > 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-bia-border">
            <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">
              Relationships — {neighbours.length} connections
            </div>
          </div>

          {outbound.length > 0 && (
            <div className="border-b border-bia-border">
              <div className="px-4 py-2 bg-bia-surface-2 text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2">
                Outbound — this node refers to
              </div>
              {outbound.map((n, i) => (
                <RelationshipRow key={i} neighbour={n} onNavigate={onNavigate} />
              ))}
            </div>
          )}

          {inbound.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-bia-surface-2 text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2">
                Inbound — referenced by
              </div>
              {inbound.map((n, i) => (
                <RelationshipRow key={i} neighbour={n} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      )}

      {neighbours.length === 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface px-4 py-6 text-center text-sm text-bia-muted">
          No relationships indexed for this node.
        </div>
      )}
    </div>
  )
}

function RelationshipRow({ neighbour, onNavigate }: { neighbour: GraphNeighbourClient; onNavigate: (n: GraphNodeClient) => void }) {
  return (
    <button
      onClick={() => onNavigate(neighbour.node)}
      className="flex w-full items-center gap-3 border-b border-bia-border px-4 py-3 text-left hover:bg-bia-surface-2 transition-colors last:border-b-0"
    >
      <span
        className="shrink-0 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: REL_COLOR[neighbour.relationship] ?? '#9CA3AF' }}
      />
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
        style={{ color: REL_COLOR[neighbour.relationship] ?? '#6B7280', backgroundColor: `${REL_COLOR[neighbour.relationship] ?? '#6B7280'}15` }}
      >
        {neighbour.relationship}
      </span>
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white"
        style={{ backgroundColor: NODE_TYPE_COLOR[neighbour.node.type] ?? '#6B7280' }}
      >
        {NODE_TYPE_LABEL[neighbour.node.type] ?? neighbour.node.type}
      </span>
      <span className="flex-1 text-sm font-medium text-bia-text truncate">{neighbour.node.title}</span>
      <span className="shrink-0 text-xs text-bia-muted">{neighbour.node.authority.toFixed(2)}</span>
    </button>
  )
}
