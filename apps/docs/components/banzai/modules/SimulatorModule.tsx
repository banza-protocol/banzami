'use client'

import { useState } from 'react'
import { runSimulation, type SimulatorResult, type SimulationChange } from '@/lib/banzai-client'

const ALL_CAPABILITIES = [
  'supports_wallets', 'supports_transfers', 'supports_qr', 'supports_payment_requests',
  'supports_traces', 'supports_webhooks', 'supports_manifest', 'supports_federation', 'supports_cross_operator',
]

const LEVEL_COLORS = ['#374151', '#2A3A8C', '#0E7490', '#7C3AED', '#990011']

const EFFORT_COLOR: Record<string, string> = {
  none: 'text-bia-green bg-bia-green/10 border-bia-green/30',
  minimal: 'text-bia-green bg-bia-green/10 border-bia-green/30',
  low: 'text-blue-700 bg-blue-50 border-blue-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  high: 'text-red-700 bg-red-50 border-red-200',
  extensive: 'text-red-800 bg-red-100 border-red-300',
}

const DEFAULT_MANIFEST = `{
  "operator_id": "op_example_001",
  "environment": "sandbox",
  "protocol_version": "1.0.0"
}`

export function SimulatorModule() {
  const [manifestText, setManifestText] = useState(DEFAULT_MANIFEST)
  const [currentCaps, setCurrentCaps] = useState<string[]>(['supports_wallets', 'supports_transfers', 'supports_qr'])
  const [targetLevel, setTargetLevel] = useState(2)
  const [addCaps, setAddCaps] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulatorResult | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const toggleCurrentCap = (cap: string) =>
    setCurrentCaps(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])

  const toggleAddCap = (cap: string) =>
    setAddCaps(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])

  const simulate = async () => {
    let manifest: Record<string, unknown>
    try { manifest = JSON.parse(manifestText); setManifestError(null) }
    catch { setManifestError('Invalid JSON'); return }

    const changes: SimulationChange[] = addCaps.map(c => ({ type: 'add_capability', capability: c }))
    setLoading(true); setResult(null)
    const res = await runSimulation({ manifest, capabilities: currentCaps, target_level: targetLevel, proposed_changes: changes })
    setResult(res); setLoading(false)
  }

  const availableToAdd = ALL_CAPABILITIES.filter(c => !currentCaps.includes(c))

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Protocol Simulator</h2>
          <p className="text-sm text-bia-muted">
            Simulate protocol changes before implementing them. Add capabilities and see the readiness
            delta, certification impact, and estimated effort — before touching any code.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Current state */}
          <div className="space-y-3">
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Current Manifest</label>
              <textarea
                value={manifestText}
                onChange={e => { setManifestText(e.target.value); setManifestError(null) }}
                rows={6}
                className="w-full rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 font-mono text-xs text-bia-text outline-none focus:border-bia-primary/50 resize-none"
                spellCheck={false}
              />
              {manifestError && <p className="text-xs text-red-600">{manifestError}</p>}
            </div>

            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Current Capabilities</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CAPABILITIES.map(cap => (
                  <button
                    key={cap}
                    onClick={() => toggleCurrentCap(cap)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                      currentCaps.includes(cap)
                        ? 'bg-bia-primary/10 border-bia-primary/30 text-bia-primary'
                        : 'bg-bia-surface-2 border-bia-border text-bia-muted hover:bg-bia-surface'
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Proposed changes */}
          <div className="space-y-3">
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Proposed Changes — Add Capabilities</label>
              <p className="text-[10px] text-bia-muted-2">Select capabilities to simulate adding.</p>
              {availableToAdd.length === 0 ? (
                <p className="text-xs text-bia-muted italic">All capabilities already declared.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {availableToAdd.map(cap => (
                    <button
                      key={cap}
                      onClick={() => toggleAddCap(cap)}
                      className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                        addCaps.includes(cap)
                          ? 'bg-bia-green/10 border-bia-green/30 text-bia-green'
                          : 'bg-bia-surface-2 border-bia-border text-bia-muted hover:bg-bia-surface'
                      }`}
                    >
                      {addCaps.includes(cap) ? '+ ' : ''}{cap}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Target Level</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map(l => (
                  <button
                    key={l}
                    onClick={() => setTargetLevel(l)}
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

            <div className="rounded-xl border border-bia-border bg-bia-surface p-3 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Changes to Simulate</div>
              {addCaps.length === 0 ? (
                <p className="text-xs text-bia-muted italic">No proposed changes yet.</p>
              ) : addCaps.map(c => (
                <div key={c} className="flex items-center gap-1.5 text-xs text-bia-green font-mono">
                  <span>+</span><span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={simulate}
          disabled={loading || addCaps.length === 0}
          className="flex items-center gap-2 rounded-lg bg-bia-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading
            ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Simulating…</>
            : <>Run Simulation</>
          }
        </button>

        {result && <SimulatorResultView result={result} />}
      </div>
    </div>
  )
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-bia-muted">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-bia-surface-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function SimulatorResultView({ result }: { result: SimulatorResult }) {
  const delta = result.readiness_delta
  const deltaColor = delta > 0 ? '#15803D' : delta < 0 ? '#991B1B' : '#64748B'

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-bia-border bg-bia-surface p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`text-2xl font-bold ${delta > 0 ? 'text-bia-green' : delta < 0 ? 'text-red-700' : 'text-bia-muted'}`}>
            {delta > 0 ? '+' : ''}{delta} pts
          </div>
          <div className="flex-1 text-sm text-bia-muted">{result.summary}</div>
          <span className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border ${EFFORT_COLOR[result.estimated_effort]}`}>
            {result.estimated_effort} effort remaining
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ScoreBar label="Before" value={result.before.readiness_score} color="#64748B" />
          <ScoreBar label="After simulation" value={result.after.readiness_score} color={deltaColor} />
        </div>
      </div>

      {/* Certification impact */}
      <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2">Certification Impact</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-bia-muted uppercase tracking-wider mb-1">Requirements Satisfied</div>
            {result.certification_impact.requirements_satisfied.length === 0
              ? <span className="text-xs text-bia-muted italic">None</span>
              : result.certification_impact.requirements_satisfied.map(id => (
                <div key={id} className="text-xs text-bia-green font-mono flex items-center gap-1">
                  <span>✓</span><span>{id}</span>
                </div>
              ))
            }
          </div>
          <div>
            <div className="text-[10px] text-bia-muted uppercase tracking-wider mb-1">Still Missing</div>
            {result.certification_impact.requirements_still_missing.slice(0, 4).map(id => (
              <div key={id} className="text-xs text-amber-700 font-mono flex items-center gap-1">
                <span>○</span><span>{id}</span>
              </div>
            ))}
          </div>
        </div>
        {result.certification_impact.level_unlocked && (
          <div className="mt-2 rounded-lg bg-bia-green/10 border border-bia-green/30 px-3 py-2 text-sm text-bia-green font-semibold">
            ✓ Level {result.certification_impact.new_level} certification becomes achievable after these changes.
          </div>
        )}
        {result.federation_impact.newly_eligible && (
          <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 text-sm text-purple-700 font-semibold">
            ✓ Federation eligibility unlocked.
          </div>
        )}
      </div>

      {/* Before/After level statuses */}
      <div className="grid grid-cols-2 gap-3">
        {(['before', 'after'] as const).map(key => (
          <div key={key} className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
            <div className="px-3 py-2 border-b border-bia-border text-xs font-semibold uppercase tracking-wider text-bia-muted-2">
              {key === 'before' ? 'Current State' : 'After Changes'}
            </div>
            {result[key].level_statuses.map(ls => (
              <div key={ls.level} className="flex items-center gap-2 px-3 py-1.5 border-b border-bia-border last:border-b-0">
                <div className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: LEVEL_COLORS[ls.level] }}>{ls.level}</div>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 rounded-full bg-bia-surface-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${ls.total_count > 0 ? (ls.achieved_count / ls.total_count) * 100 : 0}%`,
                      backgroundColor: LEVEL_COLORS[ls.level]
                    }} />
                  </div>
                </div>
                <span className={`text-[9px] font-semibold ${ls.status === 'achieved' ? 'text-bia-green' : ls.status === 'partial' ? 'text-amber-600' : 'text-bia-muted'}`}>
                  {ls.status}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
