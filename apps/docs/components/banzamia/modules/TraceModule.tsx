'use client'

import { useState } from 'react'

const DEMO_TRACE = {
  trace_id: 'tr_demo_abc123',
  events: [
    { type: 'qr.created',         entity_id: 'qr_demo_001',  ts: '2026-05-28T14:00:00Z', amount_minor: 5000, currency: 'XOF' },
    { type: 'transfer.initiated',  entity_id: 'txf_demo_001', ts: '2026-05-28T14:00:03Z', gross_minor: 5000, net_minor: 4850, fee_minor: 150 },
    { type: 'ledger.debit',        entity_id: 'led_demo_001', ts: '2026-05-28T14:00:03Z', wallet_id: 'wal_payer', amount_minor: 5000 },
    { type: 'ledger.credit',       entity_id: 'led_demo_002', ts: '2026-05-28T14:00:03Z', wallet_id: 'wal_merchant', amount_minor: 4850 },
    { type: 'ledger.credit',       entity_id: 'led_demo_003', ts: '2026-05-28T14:00:03Z', wallet_id: 'wal_fee', amount_minor: 150 },
    { type: 'transfer.completed',  entity_id: 'txf_demo_001', ts: '2026-05-28T14:00:04Z' },
    { type: 'qr.paid',             entity_id: 'qr_demo_001',  ts: '2026-05-28T14:00:04Z' },
    { type: 'settlement.assigned', entity_id: 'stl_demo_001', ts: '2026-05-28T14:00:04Z' },
  ],
  invariants: {
    'INV-TRACE-001': 'PASS',
    'INV-LEDGER-001': 'PASS',
    'INV-LEDGER-002': 'PASS',
    'INV-STL-001': 'PASS',
    'INV-STL-002': 'PASS',
  },
}

const EVENT_COLORS: Record<string, string> = {
  'qr.created':         'text-blue-400 border-blue-400/30 bg-blue-400/5',
  'transfer.initiated': 'text-bia-gold border-bia-gold/30 bg-bia-gold/5',
  'transfer.completed': 'text-bia-green border-bia-green/30 bg-bia-green/5',
  'ledger.debit':       'text-bia-red border-bia-red/30 bg-bia-red/5',
  'ledger.credit':      'text-bia-green border-bia-green/30 bg-bia-green/5',
  'qr.paid':            'text-bia-green border-bia-green/30 bg-bia-green/5',
  'settlement.assigned':'text-purple-400 border-purple-400/30 bg-purple-400/5',
}

export function TraceModule() {
  const [traceId, setTraceId] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!traceId.trim() && traceId !== '') return
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)
    setLoaded(true)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Trace Explainer</h2>
          <p className="text-sm text-bia-muted">Reconstruct and verify the causal event timeline of any Banzami payment flow.</p>
        </div>

        <div className="flex gap-2">
          <input
            value={traceId}
            onChange={e => setTraceId(e.target.value)}
            placeholder="tr_abc123  (leave empty for demo trace)"
            className="flex-1 rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm text-bia-text font-mono placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
          />
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-bia-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? '…' : 'Load'}
          </button>
          <button
            onClick={() => { setTraceId(''); setLoaded(true) }}
            className="rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm text-bia-muted hover:bg-bia-surface-2"
          >
            Demo
          </button>
        </div>

        {loaded && (
          <>
            {/* Trace header */}
            <div className="rounded-xl border border-bia-border bg-bia-surface px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2 mb-1">Trace ID</div>
              <div className="font-mono text-sm text-bia-gold">{traceId || DEMO_TRACE.trace_id}</div>
            </div>

            {/* Timeline */}
            <div className="relative space-y-0">
              {DEMO_TRACE.events.map((ev, i) => (
                <div key={i} className="flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`h-3 w-3 rounded-full border-2 shrink-0 mt-2.5 z-10 ${
                      ev.type.includes('completed') || ev.type.includes('paid') || ev.type.includes('credit')
                        ? 'border-bia-green bg-bia-green/30'
                        : ev.type.includes('debit')
                        ? 'border-bia-red bg-bia-red/30'
                        : 'border-bia-gold bg-bia-gold/30'
                    }`} />
                    {i < DEMO_TRACE.events.length - 1 && (
                      <div className="w-px flex-1 bg-bia-border mt-0.5 min-h-[16px]" />
                    )}
                  </div>

                  {/* Event card */}
                  <div className={`mb-1 flex-1 rounded-lg border px-3 py-2 text-xs ${EVENT_COLORS[ev.type] ?? 'text-bia-muted border-bia-border bg-bia-surface'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{ev.type}</span>
                      <span className="font-mono text-[10px] opacity-60">{ev.ts.slice(11, 19)}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] opacity-70">{ev.entity_id}</div>
                    {(ev as {amount_minor?: number}).amount_minor !== undefined && (
                      <div className="mt-0.5 text-[10px] opacity-80">
                        {(ev as {amount_minor?: number; currency?: string}).currency} {((ev as {amount_minor?: number}).amount_minor! / 100).toFixed(2)}
                      </div>
                    )}
                    {(ev as {gross_minor?: number}).gross_minor !== undefined && (
                      <div className="mt-0.5 text-[10px] opacity-80">
                        gross {(ev as {gross_minor?: number}).gross_minor} = net {(ev as {net_minor?: number}).net_minor} + fee {(ev as {fee_minor?: number}).fee_minor}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Invariant status */}
            <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Invariant verification</div>
              </div>
              <div className="p-3 grid grid-cols-1 gap-1.5">
                {Object.entries(DEMO_TRACE.invariants).map(([inv, status]) => (
                  <div key={inv} className="flex items-center gap-3 rounded-lg bg-bia-surface-2 px-3 py-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${status === 'PASS' ? 'bg-bia-green' : 'bg-bia-red'}`} />
                    <span className="flex-1 font-mono text-xs text-bia-text">{inv}</span>
                    <span className={`text-xs font-bold ${status === 'PASS' ? 'text-bia-green' : 'text-bia-red'}`}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
