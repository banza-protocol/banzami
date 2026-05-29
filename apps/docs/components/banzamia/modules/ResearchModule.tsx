'use client'

import { useState } from 'react'
import { researchQuestion, type ResearchReport, type ResearchStep } from '@/lib/banzamia-client'

const EXAMPLE_QUESTIONS = [
  'What do I need to become a Federation Operator?',
  'Which RFCs affect settlement and why?',
  'Explain the dependency chain for certification level 3.',
  'How is traceability enforced across the protocol?',
  'What invariants protect the ledger from money creation?',
]

const STEP_ICON: Record<ResearchStep['type'], React.ReactNode> = {
  plan: (
    <path d="M3 5h10M3 8h7M3 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  ),
  retrieval: (
    <>
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  graph: (
    <>
      <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="7" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="9" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </>
  ),
  tool: (
    <path d="M4 8h8M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  synthesis: (
    <>
      <path d="M2 12l4-8 3 6 2-3 3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
}

const STEP_COLOR: Record<ResearchStep['type'], string> = {
  plan:      'text-bia-muted bg-bia-surface-2 border-bia-border',
  retrieval: 'text-blue-700 bg-blue-50 border-blue-200',
  graph:     'text-amber-700 bg-amber-50 border-amber-200',
  tool:      'text-purple-700 bg-purple-50 border-purple-200',
  synthesis: 'text-bia-primary bg-bia-primary-glow border-bia-primary/20',
}

const QUALITY_CONFIG: Record<string, { label: string; color: string }> = {
  high:   { label: 'High Quality', color: 'text-bia-green bg-bia-green/10 border-bia-green/30' },
  medium: { label: 'Medium Quality', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  low:    { label: 'Low Quality', color: 'text-red-700 bg-red-50 border-red-200' },
}

export function ResearchModule() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ResearchReport | null>(null)
  const [activeTab, setActiveTab] = useState<'answer' | 'evidence' | 'graph'>('answer')

  const runResearch = async () => {
    if (!question.trim() || loading) return
    setLoading(true)
    setReport(null)
    const result = await researchQuestion(question.trim())
    setReport(result)
    setLoading(false)
    setActiveTab('answer')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Protocol Research</h2>
          <p className="text-sm text-bia-muted">
            Multi-step agentic research across the protocol knowledge base, Protocol Graph, and deterministic tools.
            The agent retrieves, traverses, and synthesises before answering.
          </p>
        </div>

        {/* Input */}
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Research Question</label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runResearch() }}
            placeholder="Ask a deep protocol question — the agent will research across multiple sources before answering…"
            rows={3}
            className="w-full rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 text-sm text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50 resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={runResearch}
              disabled={loading || !question.trim()}
              className="flex items-center gap-2 rounded-lg bg-bia-primary px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Researching…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M3 5h10M3 8h7M3 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Research
                </>
              )}
            </button>
            <span className="text-xs text-bia-muted-2">⌘↵ to run</span>
          </div>
        </div>

        {/* Example questions */}
        {!report && !loading && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Example research questions</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => setQuestion(q)}
                  className="rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm text-bia-text hover:bg-bia-surface-2 hover:border-bia-primary/30 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Research steps (shown while loading + after) */}
        {(loading || report) && (
          <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-bia-border flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Research Steps</div>
              {report && (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${QUALITY_CONFIG[report.research_quality]?.color}`}>
                    {QUALITY_CONFIG[report.research_quality]?.label}
                  </span>
                  <span className="text-[10px] text-bia-muted">{(report.duration_ms / 1000).toFixed(1)}s</span>
                </div>
              )}
            </div>
            <div className="divide-y divide-bia-border">
              {(report?.steps ?? []).map(step => (
                <div key={step.step} className="flex items-start gap-3 px-4 py-3">
                  <span className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-md border ${STEP_COLOR[step.type]}`}>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                      {STEP_ICON[step.type]}
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-bia-text">{step.description}</div>
                    <div className="mt-0.5 flex items-center gap-3">
                      {step.sources_found !== undefined && (
                        <span className="text-[10px] text-bia-muted">{step.sources_found} sources</span>
                      )}
                      {step.nodes_found !== undefined && (
                        <span className="text-[10px] text-bia-muted">{step.nodes_found} graph nodes</span>
                      )}
                      {step.duration_ms !== undefined && (
                        <span className="text-[10px] text-bia-muted">{step.duration_ms}ms</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="shrink-0 h-4 w-4 animate-spin rounded-full border-2 border-bia-border border-t-bia-primary" />
                  <span className="text-sm text-bia-muted">Running research…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Report output */}
        {report && (
          <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-bia-border">
              {([
                { id: 'answer', label: 'Synthesis' },
                { id: 'evidence', label: `Evidence (${report.evidence.length})` },
                { id: 'graph', label: `Graph (${report.graph_nodes.length})` },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-bia-primary text-bia-primary'
                      : 'border-transparent text-bia-muted hover:text-bia-text'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Synthesis tab */}
            {activeTab === 'answer' && (
              <div className="p-5">
                <div className="prose prose-sm prose-banzami max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-bia-text">{report.answer}</pre>
                </div>
                {report.relationship_chains.length > 0 && (
                  <div className="mt-4 rounded-lg bg-bia-surface-2 border border-bia-border p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2 mb-2">Relationship Chains</div>
                    {report.relationship_chains.map((chain, i) => (
                      <div key={i} className="text-xs font-mono text-bia-text py-0.5">{chain}</div>
                    ))}
                  </div>
                )}
                {report.contradictions.length > 0 && (
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-2">
                      ⚠ Potential Contradictions ({report.contradictions.length})
                    </div>
                    {report.contradictions.map((c, i) => (
                      <div key={i} className="text-xs text-amber-700">{c.topic}: {c.description}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Evidence tab */}
            {activeTab === 'evidence' && (
              <div className="divide-y divide-bia-border">
                {report.evidence.map((e, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-bia-primary">#{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-bia-text truncate">{e.title}</span>
                      <span className="shrink-0 text-[10px] text-bia-muted">auth={e.authority.toFixed(2)}</span>
                      <span className="shrink-0 text-[10px] text-bia-muted">score={e.score.toFixed(2)}</span>
                    </div>
                    <div className="text-xs font-mono text-bia-muted-2 mb-1">{e.source_path}</div>
                    <div className="text-xs text-bia-muted leading-relaxed">{e.excerpt}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Graph tab */}
            {activeTab === 'graph' && (
              <div className="divide-y divide-bia-border">
                {report.graph_nodes.map((n, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs font-mono text-bia-gold">{n.type.toUpperCase()}</span>
                    <span className="font-mono text-xs text-bia-muted-2">{n.id}</span>
                    <span className="text-sm text-bia-text">{n.title}</span>
                  </div>
                ))}
                {report.graph_nodes.length === 0 && (
                  <div className="py-8 text-center text-sm text-bia-muted">No graph nodes found — run graph:index to enable graph traversal.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
