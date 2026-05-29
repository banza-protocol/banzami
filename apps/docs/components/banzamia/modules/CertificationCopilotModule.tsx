'use client'

import { useState } from 'react'
import { certificationCopilot, type CopilotResult, type LevelStatus } from '@/lib/banzamia-client'

const LEVEL_COLORS = ['#374151', '#2A3A8C', '#0E7490', '#7C3AED', '#990011']

const DEFAULT_MANIFEST = `{
  "operator_id": "op_example_001",
  "environment": "sandbox",
  "simulated": true,
  "production_allowed": false,
  "protocol_version": "1.0.0",
  "capabilities": {
    "supports_wallets": true,
    "supports_transfers": true,
    "supports_qr": true
  }
}`

const CAPABILITIES_LIST = [
  'supports_wallets', 'supports_transfers', 'supports_qr', 'supports_payment_requests',
  'supports_traces', 'supports_webhooks', 'supports_manifest', 'supports_federation', 'supports_cross_operator',
]

export function CertificationCopilotModule() {
  const [manifestText, setManifestText] = useState(DEFAULT_MANIFEST)
  const [capabilities, setCapabilities] = useState<string[]>(['supports_wallets', 'supports_transfers', 'supports_qr'])
  const [targetLevel, setTargetLevel] = useState(2)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CopilotResult | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const toggleCapability = (cap: string) => {
    setCapabilities(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])
  }

  const analyze = async () => {
    let manifest: Record<string, unknown> | undefined
    try {
      manifest = JSON.parse(manifestText)
      setManifestError(null)
    } catch {
      setManifestError('Invalid JSON — please fix the manifest before analyzing.')
      return
    }

    setLoading(true)
    setResult(null)
    const res = await certificationCopilot({ manifest, capabilities, target_level: targetLevel })
    setResult(res)
    setLoading(false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Certification Copilot</h2>
          <p className="text-sm text-bia-muted">
            Analyse your operator manifest and capabilities against Banzami certification requirements.
            Get your current level, missing items, readiness score, and a step-by-step roadmap.
          </p>
        </div>

        {/* Input form */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Manifest */}
          <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Operator Manifest (JSON)</label>
            <textarea
              value={manifestText}
              onChange={e => { setManifestText(e.target.value); setManifestError(null) }}
              rows={12}
              className="w-full rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 font-mono text-xs text-bia-text outline-none focus:border-bia-primary/50 resize-none"
              spellCheck={false}
            />
            {manifestError && (
              <p className="text-xs text-red-600">{manifestError}</p>
            )}
          </div>

          {/* Capabilities + target */}
          <div className="space-y-4">
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Declared Capabilities</label>
              <div className="space-y-1.5">
                {CAPABILITIES_LIST.map(cap => (
                  <button
                    key={cap}
                    onClick={() => toggleCapability(cap)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      capabilities.includes(cap)
                        ? 'bg-bia-primary-glow border border-bia-primary/30 text-bia-text'
                        : 'border border-bia-border bg-bia-surface-2 text-bia-muted hover:bg-bia-surface'
                    }`}
                  >
                    <span className={`h-3.5 w-3.5 shrink-0 rounded border ${
                      capabilities.includes(cap)
                        ? 'border-bia-primary bg-bia-primary flex items-center justify-center'
                        : 'border-bia-border-2 bg-white'
                    }`}>
                      {capabilities.includes(cap) && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className="font-mono">{cap}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Target Level</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map(l => (
                  <button
                    key={l}
                    onClick={() => setTargetLevel(l)}
                    className={`flex flex-col items-center rounded-lg py-2.5 text-center transition-all ${
                      targetLevel === l ? 'text-white shadow-sm' : 'bg-bia-surface-2 border border-bia-border text-bia-muted hover:bg-bia-surface'
                    }`}
                    style={targetLevel === l ? { backgroundColor: LEVEL_COLORS[l] } : {}}
                  >
                    <span className="text-lg font-bold">{l}</span>
                    <span className="text-[9px] leading-tight mt-0.5 px-1">{['Ref', 'Proto', 'Trace', 'Fed', 'Settle'][l]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-bia-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Analysing…</>
          ) : (
            <>Analyse Certification Readiness</>
          )}
        </button>

        {/* Result */}
        {result && <CopilotResultView result={result} />}
      </div>
    </div>
  )
}

function CopilotResultView({ result }: { result: CopilotResult }) {
  const readinessColor = result.readiness_score >= 80 ? 'text-bia-green' : result.readiness_score >= 50 ? 'text-amber-700' : 'text-red-700'

  return (
    <div className="space-y-4">
      {/* Blocking issues */}
      {result.blocking_issues.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2">🚫 Blocking Issues</div>
          {result.blocking_issues.map((issue, i) => (
            <div key={i} className="text-sm text-red-700">{issue}</div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      <div className="rounded-xl border border-bia-border bg-bia-surface p-5">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-bia-text">{result.current_level < 0 ? '—' : result.current_level}</div>
            <div className="text-xs text-bia-muted mt-0.5">Current Level</div>
          </div>
          <div className="text-bia-muted-2">→</div>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: LEVEL_COLORS[result.target_level] }}>{result.target_level}</div>
            <div className="text-xs text-bia-muted mt-0.5">Target Level</div>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className={`text-3xl font-bold ${readinessColor}`}>{result.readiness_score}%</div>
            <div className="text-xs text-bia-muted mt-0.5">Readiness Score</div>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-bia-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${result.readiness_score}%`, backgroundColor: result.readiness_score >= 80 ? '#15803D' : result.readiness_score >= 50 ? '#92400E' : '#991B1B' }}
          />
        </div>

        {result.certification_ready && (
          <div className="mt-3 text-center text-sm font-semibold text-bia-green">
            ✓ Ready for certification submission
          </div>
        )}
      </div>

      {/* Level statuses */}
      <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-bia-border text-xs font-semibold uppercase tracking-wider text-bia-muted-2">
          Level-by-Level Status
        </div>
        {result.level_statuses.map(ls => (
          <LevelRow key={ls.level} ls={ls} />
        ))}
      </div>

      {/* Missing for target */}
      {result.missing_for_target.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Missing for Level {result.target_level}
          </div>
          {result.missing_for_target.map(req => (
            <div key={req.id} className="flex items-start gap-2.5">
              <span className="shrink-0 font-mono text-[10px] text-amber-600 bg-amber-100 rounded px-1.5 py-0.5 mt-0.5">{req.id}</span>
              <div>
                <div className="text-sm text-amber-800">{req.description}</div>
                {req.rfc && <div className="text-xs text-amber-600 mt-0.5">{req.rfc}{req.adr ? ` · ${req.adr}` : ''}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Next actions */}
      {result.next_actions.length > 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2">Recommended Next Actions</div>
          {result.next_actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-bia-primary text-[10px] font-bold text-white mt-0.5">{i + 1}</span>
              <div className="text-sm text-bia-text">{action}</div>
            </div>
          ))}
        </div>
      )}

      {/* Roadmap */}
      {result.roadmap.length > 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2">Certification Roadmap</div>
          {result.roadmap.map((segment, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: LEVEL_COLORS[segment.from_level] }}>{segment.from_level}</div>
                <div className="my-1 w-px flex-1 bg-bia-border" />
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: LEVEL_COLORS[segment.to_level] }}>{segment.to_level}</div>
              </div>
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-bia-text">Level {segment.from_level} → Level {segment.to_level}</span>
                  <span className="text-[10px] text-bia-muted border border-bia-border rounded-full px-2 py-0.5">{segment.estimated_effort}</span>
                </div>
                <ul className="space-y-1">
                  {segment.steps.map((step, j) => (
                    <li key={j} className="text-xs text-bia-muted flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-bia-muted" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LevelRow({ ls }: { ls: LevelStatus }) {
  const pct = ls.total_count > 0 ? Math.round((ls.achieved_count / ls.total_count) * 100) : 0
  return (
    <div className="flex items-center gap-3 border-b border-bia-border px-4 py-3 last:border-b-0">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
        style={{ backgroundColor: LEVEL_COLORS[ls.level] }}
      >
        {ls.level}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-bia-text">{ls.name}</span>
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
            ls.status === 'achieved' ? 'bg-bia-green/10 text-bia-green border-bia-green/30' :
            ls.status === 'partial'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-bia-surface-2 text-bia-muted border-bia-border'
          }`}>
            {ls.status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-bia-border overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: LEVEL_COLORS[ls.level] }} />
          </div>
          <span className="text-[10px] text-bia-muted shrink-0">{ls.achieved_count}/{ls.total_count}</span>
        </div>
      </div>
    </div>
  )
}
