'use client'

import { useEffect, useState } from 'react'
import { getRagStats, type RagStatsResponse } from '@/lib/banzamia-client'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-bia-border bg-bia-surface p-4 flex flex-col gap-1">
      <div className="text-2xl font-bold text-bia-text">{value}</div>
      <div className="text-xs font-semibold text-bia-muted uppercase tracking-wider">{label}</div>
      {sub && <div className="text-[10px] text-bia-muted-2">{sub}</div>}
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2">{title}</div>
      {description && <div className="text-xs text-bia-muted mt-0.5">{description}</div>}
    </div>
  )
}

function RateBar({ label, value, color = '#990011', max = 100 }: { label: string; value: number; color?: string; max?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-xs text-bia-muted">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-bia-surface-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-12 shrink-0 text-right text-xs font-mono text-bia-text">{value.toFixed(2)}</div>
    </div>
  )
}

export function QualityModule() {
  const [stats, setStats] = useState<RagStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRagStats().then(s => { setStats(s); setLoading(false) })
  }, [])

  const kb = stats?.knowledge_base
  const qa = stats?.query_analytics
  const graph = stats?.protocol_graph

  const weakRetrievalPct = qa ? Math.round(qa.weak_retrieval_rate * 100) : null
  const strongRetrievalPct = weakRetrievalPct !== null ? 100 - weakRetrievalPct : null

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Trust manifesto */}
        <div className="rounded-xl border border-bia-primary/20 bg-bia-primary/5 p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-bia-primary text-white">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L3 6v4c0 4.4 3 8.5 7 9.5 4-1 7-5.1 7-9.5V6l-7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-bia-text mb-1">Trust Through Measurement</h2>
              <p className="text-sm text-bia-muted leading-relaxed">
                We do not ask you to trust BanzAI. We show you measurements. Every number on this dashboard
                is derived from real operations — retrieval latency, citation authority, graph coverage, and
                retrieval success rates. Measure us. Do not merely trust us.
              </p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-bia-border bg-bia-surface p-6">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-bia-border border-t-bia-primary" />
            <span className="text-sm text-bia-muted">Loading quality metrics…</span>
          </div>
        )}

        {!loading && stats && (
          <>
            {/* Knowledge Base */}
            <div>
              <SectionHeader title="Knowledge Base" description="Protocol documents ingested and embedded." />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Documents Indexed" value={kb?.documents_indexed ?? 0} />
                <StatCard label="Chunks Indexed" value={kb?.chunks_indexed ?? 0} sub="Semantic units" />
                <StatCard label="Embedding Dims" value={kb?.embedding_dims ?? '—'} sub={kb?.embedding_provider ?? ''} />
                <StatCard
                  label="Last Indexed"
                  value={kb?.last_indexed_at ? new Date(kb.last_indexed_at).toLocaleDateString('pt-AO') : '—'}
                  sub="UTC"
                />
              </div>
              {(kb?.chunks_indexed ?? 0) === 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-700">
                    Knowledge base is empty. Run <code className="font-mono bg-amber-100 px-1 rounded">npm run index</code> in{' '}
                    <code className="font-mono bg-amber-100 px-1 rounded">apps/banzamia</code> to ingest protocol documents.
                  </p>
                </div>
              )}
            </div>

            {/* Protocol Graph */}
            <div>
              <SectionHeader title="Protocol Graph" description="Typed node graph extracted from protocol cross-references." />
              {graph ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Graph Nodes" value={graph.node_count} />
                    <StatCard label="Graph Edges" value={graph.edge_count} />
                    <StatCard label="Avg Connections" value={graph.node_count > 0 ? (graph.edge_count / graph.node_count).toFixed(1) : '—'} sub="Edges per node" />
                  </div>
                  {graph.nodes_by_type && Object.keys(graph.nodes_by_type).length > 0 && (
                    <div className="rounded-xl border border-bia-border bg-bia-surface p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2 mb-3">Node Type Distribution</div>
                      <div className="space-y-2">
                        {Object.entries(graph.nodes_by_type)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <RateBar
                              key={type}
                              label={type.replace(/_/g, ' ')}
                              value={count}
                              max={graph.node_count}
                              color="#C89B3C"
                            />
                          ))}
                      </div>
                    </div>
                  )}
                  {graph.node_count === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs text-amber-700">
                        Graph is empty. Run <code className="font-mono bg-amber-100 px-1 rounded">npm run graph:index</code> to build the protocol graph.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-bia-border bg-bia-surface-2 px-4 py-3">
                  <p className="text-xs text-bia-muted">Graph data unavailable — graph indexer may not have run.</p>
                </div>
              )}
            </div>

            {/* Query Analytics */}
            {qa ? (
              <div>
                <SectionHeader title="Retrieval Analytics" description="Derived from live query operations." />
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Total Queries" value={qa.total_queries.toLocaleString()} />
                    <StatCard label="Avg Latency" value={`${Math.round(qa.avg_latency_ms)} ms`} />
                    <StatCard label="Avg Citations" value={qa.avg_citations.toFixed(1)} sub="Per response" />
                    <StatCard
                      label="Avg Authority"
                      value={qa.avg_top_authority.toFixed(2)}
                      sub="0 = low, 1 = high"
                    />
                  </div>

                  {/* Retrieval quality */}
                  <div className="rounded-xl border border-bia-border bg-bia-surface p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2 mb-3">Retrieval Quality</div>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs text-bia-muted">Strong retrievals</div>
                        <div className="flex-1 h-2 rounded-full bg-bia-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${strongRetrievalPct}%`, backgroundColor: '#15803D' }}
                          />
                        </div>
                        <div className="w-12 shrink-0 text-right text-xs font-mono text-bia-text font-semibold">
                          {strongRetrievalPct}%
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs text-bia-muted">Weak retrievals</div>
                        <div className="flex-1 h-2 rounded-full bg-bia-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${weakRetrievalPct}%`, backgroundColor: weakRetrievalPct! > 30 ? '#991B1B' : '#92400E' }}
                          />
                        </div>
                        <div className="w-12 shrink-0 text-right text-xs font-mono text-bia-text">
                          {weakRetrievalPct}%
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-[10px] text-bia-muted-2">
                      Weak = top similarity &lt; 0.45 (keyword fallback activated). Strong = primary vector match succeeded.
                    </p>
                  </div>

                  {/* Task type distribution */}
                  {Object.keys(qa.task_type_distribution).length > 0 && (
                    <div className="rounded-xl border border-bia-border bg-bia-surface p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2 mb-3">Task Type Distribution</div>
                      <div className="space-y-2">
                        {Object.entries(qa.task_type_distribution)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <RateBar key={type} label={type} value={count} max={qa.total_queries} color="#990011" />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Top sources */}
                  {qa.top_sources.length > 0 && (
                    <div className="rounded-xl border border-bia-border bg-bia-surface p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2 mb-3">Top Cited Source Types</div>
                      <div className="space-y-2">
                        {qa.top_sources.slice(0, 8).map(s => (
                          <RateBar key={s.source_type} label={s.source_type} value={s.count} max={qa.top_sources[0].count} color="#C89B3C" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <SectionHeader title="Retrieval Analytics" />
                <div className="rounded-xl border border-bia-border bg-bia-surface p-5 text-center">
                  <div className="text-sm text-bia-muted mb-1">No query data yet</div>
                  <div className="text-xs text-bia-muted-2">Analytics accumulate as the system answers questions. Use the Chat or Knowledge Search modules to generate data.</div>
                </div>
              </div>
            )}

            {/* Benchmark note */}
            <div className="rounded-xl border border-bia-border bg-bia-surface p-5">
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg border border-bia-border bg-bia-surface-2 text-bia-muted">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M2 12l3-6 3 4 2-2 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2 mb-1">Benchmark Suite</div>
                  <p className="text-sm text-bia-muted leading-relaxed">
                    For detailed retrieval metrics (Top-1, Top-3, Top-5, MRR, Recall@K, citation authority benchmark),
                    run the evaluation suite:
                  </p>
                  <div className="mt-2 rounded-lg bg-bia-surface-2 border border-bia-border px-3 py-2 font-mono text-xs text-bia-text">
                    cd apps/banzamia && npm run rag:eval
                  </div>
                  <p className="mt-2 text-[10px] text-bia-muted-2">
                    Results are written to <code className="font-mono">apps/banzamia/reports/</code>. The suite evaluates against the embedded benchmark corpus and reports MRR, Precision@K, Recall@K, and citation authority distribution.
                  </p>
                </div>
              </div>
            </div>

            {/* Last updated */}
            <div className="text-[10px] text-bia-muted-2 text-right">
              Snapshot generated at {new Date(stats.generated_at).toLocaleString('pt-AO', { timeZone: 'UTC' })} UTC
            </div>
          </>
        )}
      </div>
    </div>
  )
}
