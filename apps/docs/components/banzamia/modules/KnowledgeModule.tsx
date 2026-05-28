'use client'

import { useState } from 'react'

const DEMO_RESULTS = [
  {
    id: 'vec_001',
    source: 'contexts/financial-invariants.md',
    type: 'context',
    title: 'INV-STL-001 — No Money Creation',
    excerpt: 'For every transfer, the gross amount equals the sum of net and fee amounts. net_minor + fee_minor == gross_minor.',
    score: 0.97,
  },
  {
    id: 'vec_002',
    source: 'conformance/ledger/suite.json',
    type: 'conformance',
    title: 'Ledger double-entry sub-suite',
    excerpt: 'Every transfer must produce exactly one DEBIT and one CREDIT ledger entry of equal amount.',
    score: 0.92,
  },
  {
    id: 'vec_003',
    source: 'contexts/banzami-protocol.md',
    type: 'protocol',
    title: 'Transfer entity — gross/net/fee decomposition',
    excerpt: 'A transfer moves value from one wallet to another. It always produces exactly two ledger entries: one DEBIT and one CREDIT.',
    score: 0.88,
  },
]

export function KnowledgeModule() {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 700))
    setLoading(false)
    setSearched(true)
  }

  const TYPE_COLORS: Record<string, string> = {
    context:    'text-bia-gold border-bia-gold/40 bg-amber-50',
    conformance:'text-violet-700 border-violet-200 bg-violet-50',
    protocol:   'text-blue-700 border-blue-200 bg-blue-50',
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Knowledge Search</h2>
          <p className="text-sm text-bia-muted">Semantic search over Banzami protocol docs, RFCs, ADRs, and conformance specifications.</p>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Search protocol docs, invariants, conformance suites…"
            className="flex-1 rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
          />
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="rounded-lg bg-bia-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? '…' : 'Search'}
          </button>
        </div>

        {/* Quick searches */}
        {!searched && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Quick searches</div>
            {['settlement invariants', 'trace_id propagation', 'QR payment flow', 'ledger double-entry', 'sandbox safety'].map(q => (
              <button
                key={q}
                onClick={() => { setQuery(q); setTimeout(search, 0) }}
                className="flex w-full items-center gap-2 rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-left text-sm text-bia-muted hover:bg-bia-surface-2 hover:text-bia-text transition-colors"
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {q}
              </button>
            ))}
          </div>
        )}

        {searched && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">
                {DEMO_RESULTS.length} results (demo)
              </div>
              <button onClick={() => { setSearched(false); setQuery('') }} className="text-[11px] text-bia-muted hover:text-bia-text">Clear</button>
            </div>

            {DEMO_RESULTS.map(r => (
              <div key={r.id} className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${TYPE_COLORS[r.type] ?? 'text-bia-muted border-bia-border'}`}>
                    {r.type.toUpperCase()}
                  </span>
                  <span className="font-mono text-[10px] text-bia-muted">score: {r.score.toFixed(2)}</span>
                </div>
                <div className="p-4">
                  <div className="mb-1 text-sm font-semibold text-bia-text">{r.title}</div>
                  <p className="mb-2 text-xs text-bia-muted leading-relaxed">{r.excerpt}</p>
                  <div className="font-mono text-[10px] text-bia-muted-2">{r.source}</div>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2.5 text-center text-xs text-bia-muted">
              Connect BanzamIA API with indexed Qdrant vector DB for real semantic search
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
