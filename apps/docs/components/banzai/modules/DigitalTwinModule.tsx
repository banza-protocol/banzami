'use client'

import { useState } from 'react'
import { buildDigitalTwin, type DigitalTwinResult } from '@/lib/banzai-client'

const ALL_CAPABILITIES = [
  'supports_wallets', 'supports_transfers', 'supports_qr', 'supports_payment_requests',
  'supports_traces', 'supports_webhooks', 'supports_manifest', 'supports_federation', 'supports_cross_operator',
]

const LEVEL_COLORS = ['#374151', '#2A3A8C', '#0E7490', '#7C3AED', '#990011']

const DEFAULT_MANIFEST = `{
  "operator_id": "op_example_001",
  "environment": "sandbox",
  "protocol_version": "1.0.0",
  "capabilities": {
    "supports_wallets": true,
    "supports_transfers": true,
    "supports_qr": true
  }
}`

type Tab = 'overview' | 'certification' | 'invariants' | 'rfcs' | 'timeline' | 'recommendations'

export function DigitalTwinModule() {
  const [operatorId, setOperatorId] = useState('op_example_001')
  const [manifestText, setManifestText] = useState(DEFAULT_MANIFEST)
  const [capabilities, setCapabilities] = useState<string[]>(['supports_wallets', 'supports_transfers', 'supports_qr'])
  const [targetLevel, setTargetLevel] = useState(4)
  const [loading, setLoading] = useState(false)
  const [twin, setTwin] = useState<DigitalTwinResult | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const toggleCap = (c: string) => setCapabilities(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  const build = async () => {
    let manifest: Record<string, unknown>
    try { manifest = JSON.parse(manifestText); setManifestError(null) }
    catch { setManifestError('Invalid JSON'); return }
    setLoading(true); setTwin(null)
    const result = await buildDigitalTwin({ operator_id: operatorId.trim(), manifest, capabilities, target_level: targetLevel })
    setTwin(result); setLoading(false); setActiveTab('overview')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Operator Digital Twin</h2>
          <p className="text-sm text-bia-muted">
            Build a protocol-aware virtual representation of an operator. The Digital Twin aggregates
            certification state, federation readiness, relevant invariants and RFCs, and generates
            a personalised roadmap and recommendations.
          </p>
        </div>

        {/* Input */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Operator ID</label>
              <input
                value={operatorId}
                onChange={e => setOperatorId(e.target.value)}
                className="w-full rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 text-sm text-bia-text font-mono outline-none focus:border-bia-primary/50"
              />
            </div>
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Manifest (JSON)</label>
              <textarea
                value={manifestText}
                onChange={e => { setManifestText(e.target.value); setManifestError(null) }}
                rows={8}
                className="w-full rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 font-mono text-xs text-bia-text outline-none focus:border-bia-primary/50 resize-none"
                spellCheck={false}
              />
              {manifestError && <p className="text-xs text-red-600">{manifestError}</p>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Capabilities</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CAPABILITIES.map(cap => (
                  <button key={cap} onClick={() => toggleCap(cap)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                      capabilities.includes(cap)
                        ? 'bg-bia-primary/10 border-bia-primary/30 text-bia-primary'
                        : 'bg-bia-surface-2 border-bia-border text-bia-muted hover:bg-bia-surface'
                    }`}
                  >{cap}</button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Target Level</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map(l => (
                  <button key={l} onClick={() => setTargetLevel(l)}
                    className={`flex flex-col items-center rounded-lg py-2 text-center transition-all ${
                      targetLevel === l ? 'text-white shadow-sm' : 'bg-bia-surface-2 border border-bia-border text-bia-muted hover:bg-bia-surface'
                    }`}
                    style={targetLevel === l ? { backgroundColor: LEVEL_COLORS[l] } : {}}
                  >
                    <span className="text-lg font-bold">{l}</span>
                    <span className="text-[9px] leading-tight mt-0.5">{['Ref', 'Proto', 'Trace', 'Fed', 'Settle'][l]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={build}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-bia-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading
            ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Building Twin…</>
            : <>Build Digital Twin</>
          }
        </button>

        {twin && <DigitalTwinView twin={twin} activeTab={activeTab} setActiveTab={setActiveTab} />}
      </div>
    </div>
  )
}

function DigitalTwinView({
  twin,
  activeTab,
  setActiveTab,
}: {
  twin: DigitalTwinResult
  activeTab: Tab
  setActiveTab: (t: Tab) => void
}) {
  const cert = twin.certification
  const level = cert.current_level
  const trajectory = twin.readiness_trajectory

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'certification', label: 'Certification' },
    { id: 'invariants', label: `Invariants (${twin.relevant_invariants.length})` },
    { id: 'rfcs', label: `RFCs (${twin.relevant_rfcs.length})` },
    { id: 'timeline', label: `Timeline (${twin.memory.timeline.length})` },
    { id: 'recommendations', label: `Actions (${twin.recommendations.length})` },
  ]

  return (
    <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-bia-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-bia-primary text-bia-primary' : 'border-transparent text-bia-muted hover:text-bia-text'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      <div className="p-5">
        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white text-2xl font-bold"
                style={{ backgroundColor: level >= 0 ? LEVEL_COLORS[level] : '#9CA3AF' }}>
                {level >= 0 ? level : '—'}
              </div>
              <div>
                <div className="text-base font-bold text-bia-text">{twin.operator_id}</div>
                <div className="text-sm text-bia-muted mt-0.5">{cert.level_statuses.find(ls => ls.level === level)?.name ?? 'Not certified'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-bia-muted">Trajectory:</span>
                  <span className={`text-[10px] font-semibold ${
                    trajectory.includes('Improving') ? 'text-bia-green' :
                    trajectory.includes('Declining') ? 'text-red-600' : 'text-bia-muted'
                  }`}>{trajectory}</span>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-bold text-bia-primary">{cert.readiness_score}%</div>
                <div className="text-xs text-bia-muted">Readiness (target L{cert.target_level})</div>
              </div>
            </div>

            <div className="h-2 rounded-full bg-bia-surface-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${cert.readiness_score}%`, backgroundColor: '#990011' }} />
            </div>

            <div className="text-sm text-bia-muted">{twin.capability_gap_summary}</div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-bia-border bg-bia-surface-2 p-3 text-center">
                <div className="text-xl font-bold text-bia-text">{twin.capabilities.length}</div>
                <div className="text-[10px] text-bia-muted uppercase tracking-wider">Capabilities</div>
              </div>
              <div className="rounded-lg border border-bia-border bg-bia-surface-2 p-3 text-center">
                <div className="text-xl font-bold text-bia-text">{twin.memory.assessments.length}</div>
                <div className="text-[10px] text-bia-muted uppercase tracking-wider">Assessments</div>
              </div>
              <div className="rounded-lg border border-bia-border bg-bia-surface-2 p-3 text-center">
                <div className="text-xl font-bold text-bia-text">{twin.memory.timeline.length}</div>
                <div className="text-[10px] text-bia-muted uppercase tracking-wider">Events</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {twin.capabilities.map(c => (
                <span key={c} className="rounded-md border border-bia-primary/30 bg-bia-primary/5 px-2 py-0.5 text-[10px] font-mono text-bia-primary">{c}</span>
              ))}
            </div>

            <div className="text-[10px] text-bia-muted-2">Snapshot at {twin.snapshot_at.slice(0, 19).replace('T', ' ')} UTC</div>
          </div>
        )}

        {/* Certification */}
        {activeTab === 'certification' && (
          <div className="space-y-3">
            {cert.blocking_issues.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                {cert.blocking_issues.map((b, i) => <div key={i} className="text-sm text-red-700">{b}</div>)}
              </div>
            )}
            {cert.level_statuses.map(ls => (
              <div key={ls.level} className="flex items-center gap-3 rounded-lg border border-bia-border bg-bia-surface-2 p-3">
                <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: LEVEL_COLORS[ls.level] }}>{ls.level}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-bia-text">{ls.name}</span>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
                      ls.status === 'achieved' ? 'bg-bia-green/10 text-bia-green border-bia-green/30' :
                      ls.status === 'partial'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-bia-surface text-bia-muted border-bia-border'
                    }`}>{ls.status.toUpperCase()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bia-border overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${ls.total_count > 0 ? (ls.achieved_count / ls.total_count) * 100 : 0}%`, backgroundColor: LEVEL_COLORS[ls.level] }} />
                  </div>
                </div>
                <span className="text-[10px] text-bia-muted shrink-0">{ls.achieved_count}/{ls.total_count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Invariants */}
        {activeTab === 'invariants' && (
          <div className="space-y-2">
            {twin.relevant_invariants.length === 0
              ? <p className="text-sm text-bia-muted text-center py-6">No relevant invariants for this operator configuration.</p>
              : twin.relevant_invariants.map(inv => (
                <div key={inv.invariant_id} className="rounded-lg border border-bia-border bg-bia-surface-2 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-bia-gold bg-bia-gold/10 border border-bia-gold/30 rounded px-1.5 py-0.5">{inv.invariant_id}</span>
                  </div>
                  <div className="text-sm text-bia-text">{inv.description}</div>
                  <div className="text-xs text-bia-muted mt-0.5">{inv.reason}</div>
                </div>
              ))
            }
          </div>
        )}

        {/* RFCs */}
        {activeTab === 'rfcs' && (
          <div className="space-y-2">
            {twin.relevant_rfcs.map(rfc => (
              <div key={rfc.rfc_id} className="flex items-center gap-3 rounded-lg border border-bia-border bg-bia-surface-2 p-3">
                <span className="font-mono text-xs text-bia-primary font-semibold w-20 shrink-0">{rfc.rfc_id}</span>
                <div className="flex-1 text-sm text-bia-text">{rfc.title}</div>
                <span className="text-[10px] text-bia-muted font-mono">{rfc.relevance}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        {activeTab === 'timeline' && (
          <div className="space-y-0">
            {twin.memory.timeline.length === 0
              ? <p className="text-sm text-bia-muted text-center py-6">No timeline events yet.</p>
              : [...twin.memory.timeline].reverse().map((event, i) => (
                <div key={i} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`h-3 w-3 shrink-0 rounded-full mt-0.5 ${
                      event.type === 'certification' ? 'bg-bia-green' :
                      event.type === 'federation' ? 'bg-purple-500' :
                      'bg-bia-primary'
                    }`} />
                    {i < twin.memory.timeline.length - 1 && <div className="flex-1 w-px bg-bia-border mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="text-sm font-medium text-bia-text">{event.title}</div>
                    {event.detail && <div className="text-xs text-bia-muted mt-0.5">{event.detail}</div>}
                    <div className="text-[10px] text-bia-muted-2 mt-0.5">{event.date}</div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* Recommendations */}
        {activeTab === 'recommendations' && (
          <div className="space-y-3">
            {twin.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-bia-primary text-[10px] font-bold text-white mt-0.5">{i + 1}</span>
                <div className="text-sm text-bia-text">{rec}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
