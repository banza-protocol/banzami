'use client'

import { useState } from 'react'

const RFCS = [
  { id: 'RFC-001', title: 'Wallet Model', status: 'ACTIVE', summary: 'Defines the wallet entity, balance model, ownership rules, and currency constraints.' },
  { id: 'RFC-002', title: 'Transfer Protocol', status: 'ACTIVE', summary: 'Defines the transfer entity, gross/net/fee decomposition, idempotency, and state machine.' },
  { id: 'RFC-003', title: 'Ledger Invariants', status: 'ACTIVE', summary: 'Formalises INV-LEDGER-001 through INV-LEDGER-003: double-entry, non-negative balances, immutability.' },
  { id: 'RFC-004', title: 'QR Payment Protocol', status: 'ACTIVE', summary: 'Defines QR payment lifecycle: creation, scan, payment, expiry. Links QR to transfer.' },
  { id: 'RFC-005', title: 'Settlement Model', status: 'ACTIVE', summary: 'Defines settlement batches, batch assignment rules, and INV-STL-001/INV-STL-002.' },
  { id: 'RFC-006', title: 'Operator Manifest', status: 'ACTIVE', summary: 'Defines /.well-known/banzami/operator.json schema and sandbox safety invariants.' },
  { id: 'RFC-007', title: 'Trace Model', status: 'ACTIVE', summary: 'Defines trace_id propagation rules and INV-TRACE-001. Required for Certification Level 2.' },
  { id: 'RFC-008', title: 'Federation Protocol', status: 'DRAFT', summary: 'Defines inter-operator communication, trust anchors, and capability negotiation for Level 3.' },
  { id: 'RFC-009', title: 'Payment Requests', status: 'ACTIVE', summary: 'Defines the payment request (PR) entity as an alternative to QR for e-commerce flows.' },
]

const ADRS = [
  { id: 'ADR-001', title: 'Minor units only', status: 'ACCEPTED', summary: 'All monetary amounts are stored as integers in minor units. No floating-point ever in financial calculations.' },
  { id: 'ADR-012', title: 'Certification architecture', status: 'ACCEPTED', summary: 'Certification is always a tool result, never LLM inference. Deterministic-first principle.' },
  { id: 'ADR-016', title: 'Brand architecture', status: 'ACCEPTED', summary: 'Banzami = org/infra. Banza = product. BanzamIA = AI layer. Separation preserved in all naming.' },
]

type Tab = 'rfc' | 'adr'

export function RFCExplorerModule() {
  const [tab, setTab] = useState<Tab>('rfc')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const items = tab === 'rfc' ? RFCS : ADRS
  const filtered = items.filter(i =>
    i.id.toLowerCase().includes(query.toLowerCase()) ||
    i.title.toLowerCase().includes(query.toLowerCase()) ||
    i.summary.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">RFC / ADR Explorer</h2>
          <p className="text-sm text-bia-muted">Browse Banzami protocol decisions, specifications, and rationale.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['rfc', 'adr'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null) }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t ? 'bg-bia-primary text-white' : 'border border-bia-border bg-bia-surface text-bia-muted hover:bg-bia-surface-2'
              }`}
            >
              {t.toUpperCase()}s
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Pesquisar ${tab.toUpperCase()}s…`}
          className="w-full rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
        />

        {/* List */}
        <div className="space-y-1.5">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => setSelected(selected === item.id ? null : item.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selected === item.id ? 'border-bia-primary/30 bg-bia-primary-glow' : 'border-bia-border bg-bia-surface hover:bg-bia-surface-2'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-bia-gold shrink-0">{item.id}</span>
                <span className="flex-1 text-sm font-medium text-bia-text">{item.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  item.status === 'ACTIVE' || item.status === 'ACCEPTED'
                    ? 'bg-bia-green/10 text-bia-green border border-bia-green/30'
                    : 'bg-bia-amber/10 text-bia-amber border border-bia-amber/30'
                }`}>
                  {item.status}
                </span>
              </div>
              {selected === item.id && (
                <p className="mt-2.5 text-sm text-bia-muted leading-relaxed border-t border-bia-border pt-2.5">
                  {item.summary}
                </p>
              )}
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-bia-muted">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
