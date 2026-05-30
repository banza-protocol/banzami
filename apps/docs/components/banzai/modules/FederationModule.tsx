'use client'

import { useState } from 'react'
import { analyzeFederation, type FederationResult } from '@/lib/banzai-client'

const ALL_CAPABILITIES = [
  'supports_wallets', 'supports_transfers', 'supports_qr', 'supports_payment_requests',
  'supports_traces', 'supports_webhooks', 'supports_manifest', 'supports_federation', 'supports_cross_operator',
]

const DEFAULT_MANIFEST_A = `{
  "operator_id": "op_alpha_001",
  "environment": "sandbox",
  "protocol_version": "1.0.0"
}`

const DEFAULT_MANIFEST_B = `{
  "operator_id": "op_beta_002",
  "environment": "sandbox",
  "protocol_version": "1.0.0"
}`

function CapSelector({ selected, onChange }: { selected: string[]; onChange: (caps: string[]) => void }) {
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c])
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_CAPABILITIES.map(cap => (
        <button key={cap} onClick={() => toggle(cap)}
          className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
            selected.includes(cap)
              ? 'bg-bia-primary/10 border-bia-primary/30 text-bia-primary'
              : 'bg-bia-surface-2 border-bia-border text-bia-muted hover:bg-bia-surface'
          }`}
        >{cap}</button>
      ))}
    </div>
  )
}

export function FederationModule() {
  const [manifestA, setManifestA] = useState(DEFAULT_MANIFEST_A)
  const [capsA, setCapsA] = useState<string[]>(['supports_wallets', 'supports_transfers', 'supports_qr'])
  const [manifestB, setManifestB] = useState(DEFAULT_MANIFEST_B)
  const [capsB, setCapsB] = useState<string[]>(['supports_wallets', 'supports_transfers', 'supports_qr', 'supports_traces'])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FederationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyze = async () => {
    let mA: Record<string, unknown>, mB: Record<string, unknown>
    try { mA = JSON.parse(manifestA) } catch { setError('Invalid JSON in Operator A manifest'); return }
    try { mB = JSON.parse(manifestB) } catch { setError('Invalid JSON in Operator B manifest'); return }
    setError(null); setLoading(true); setResult(null)
    const res = await analyzeFederation({
      operator_a: { operator_id: (mA['operator_id'] as string) ?? 'operator_a', manifest: mA, capabilities: capsA },
      operator_b: { operator_id: (mB['operator_id'] as string) ?? 'operator_b', manifest: mB, capabilities: capsB },
    })
    setResult(res); setLoading(false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Federation Intelligence</h2>
          <p className="text-sm text-bia-muted">
            Analyse operator-to-operator federation compatibility. Identify missing capabilities,
            protocol conflicts, and the exact steps required to establish cross-operator federation.
          </p>
        </div>

        {/* Operator inputs */}
        <div className="grid gap-4 md:grid-cols-2">
          {([
            { label: 'Operator A', manifest: manifestA, setManifest: setManifestA, caps: capsA, setCaps: setCapsA },
            { label: 'Operator B', manifest: manifestB, setManifest: setManifestB, caps: capsB, setCaps: setCapsB },
          ] as const).map((op, i) => (
            <div key={i} className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2">{op.label}</div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2">Manifest (JSON)</label>
                <textarea
                  value={op.manifest}
                  onChange={e => { (op.setManifest as (v: string) => void)(e.target.value); setError(null) }}
                  rows={5}
                  className="w-full mt-1 rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 font-mono text-xs text-bia-text outline-none focus:border-bia-primary/50 resize-none"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2">Capabilities</label>
                <div className="mt-1.5">
                  <CapSelector selected={op.caps as string[]} onChange={op.setCaps as (c: string[]) => void} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-bia-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading
            ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Analysing…</>
            : <>Analyse Federation Compatibility</>
          }
        </button>

        {result && <FederationResultView result={result} />}
      </div>
    </div>
  )
}

function FederationResultView({ result }: { result: FederationResult }) {
  const scoreColor = result.compatibility_score >= 80 ? '#15803D' : result.compatibility_score >= 50 ? '#92400E' : '#991B1B'

  return (
    <div className="space-y-4">
      {/* Blocking issues */}
      {result.blocking_issues.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2">🚫 Federation Blocked</div>
          {result.blocking_issues.map((b, i) => <div key={i} className="text-sm text-red-700">{b}</div>)}
        </div>
      )}

      {/* Score overview */}
      <div className="rounded-xl border border-bia-border bg-bia-surface p-5">
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: scoreColor }}>{result.compatibility_score}</div>
            <div className="text-xs text-bia-muted mt-0.5">Compatibility Score</div>
          </div>
          <div className="flex-1">
            <div className="h-2 rounded-full bg-bia-surface-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${result.compatibility_score}%`, backgroundColor: scoreColor }} />
            </div>
          </div>
          <div className={`text-sm font-bold px-3 py-1.5 rounded-full border ${
            result.federation_ready
              ? 'bg-bia-green/10 text-bia-green border-bia-green/30'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {result.federation_ready ? '✓ Federation Ready' : '✗ Not Ready'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { id: result.operator_a_id, level: result.operator_a_level, missing: result.missing_in_a, effort: result.estimated_effort_a },
            { id: result.operator_b_id, level: result.operator_b_level, missing: result.missing_in_b, effort: result.estimated_effort_b },
          ].map((op, i) => (
            <div key={i} className="rounded-lg border border-bia-border bg-bia-surface-2 p-3">
              <div className="text-xs font-semibold text-bia-text mb-1 truncate">{op.id}</div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-bia-muted">Level</span>
                <span className="text-sm font-bold text-bia-text">{op.level < 0 ? '—' : op.level}</span>
                <span className="text-[10px] text-bia-muted ml-auto">Effort: {op.effort}</span>
              </div>
              {op.missing.length > 0 && (
                <div className="space-y-0.5">
                  <div className="text-[9px] text-amber-600 font-semibold uppercase">Missing capabilities</div>
                  {op.missing.map(c => <div key={c} className="text-[10px] font-mono text-amber-700">○ {c}</div>)}
                </div>
              )}
              {op.missing.length === 0 && (
                <div className="text-[10px] text-bia-green">✓ All federation capabilities present</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Shared capabilities */}
      {result.shared_capabilities.length > 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2 mb-2">
            Shared Capabilities ({result.shared_capabilities.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.shared_capabilities.map(c => (
              <span key={c} className="rounded-md border border-bia-green/30 bg-bia-green/10 px-2 py-0.5 text-[10px] font-mono text-bia-green">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Conflicts */}
      {result.conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-red-700">Protocol Conflicts</div>
          {result.conflicts.map((c, i) => (
            <div key={i} className="text-sm text-red-700">
              <span className="font-mono font-semibold">{c.field}</span>: {c.description}
            </div>
          ))}
        </div>
      )}

      {/* Next actions */}
      {result.suggested_next_actions.length > 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-bia-muted-2">Recommended Next Actions</div>
          {result.suggested_next_actions.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-bia-primary text-[10px] font-bold text-white mt-0.5">{i + 1}</span>
              <div className="text-sm text-bia-text">{a}</div>
            </div>
          ))}
        </div>
      )}

      {/* Analysis notes */}
      {result.analysis_notes.length > 0 && (
        <div className="rounded-xl border border-bia-border bg-bia-surface-2 p-3 space-y-1">
          {result.analysis_notes.map((n, i) => (
            <div key={i} className="text-xs text-bia-muted">{n}</div>
          ))}
        </div>
      )}
    </div>
  )
}
