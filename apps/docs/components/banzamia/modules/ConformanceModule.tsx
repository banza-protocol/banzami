'use client'

import { useState } from 'react'

const CERT_LEVELS = [
  { level: 0, name: 'Reference-compatible', suites: 'health, wallets, transfers' },
  { level: 1, name: 'Protocol-compatible',  suites: '+ QR, payment-requests, events, ledger, settlement' },
  { level: 2, name: 'Trace-compatible',     suites: '+ traces' },
  { level: 3, name: 'Federation-ready',     suites: '+ manifest, capabilities' },
  { level: 4, name: 'Settlement-compatible',suites: '+ settlement invariants' },
]

export function ConformanceModule({ mode }: { mode: 'demo' | 'live' }) {
  const [url, setUrl] = useState('')
  const [level, setLevel] = useState(2)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<null | 'demo'>(null)

  const run = async () => {
    if (!url.trim()) return
    setRunning(true)
    await new Promise(r => setTimeout(r, 1800))
    setRunning(false)
    setResult('demo')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Conformance Runner</h2>
          <p className="text-sm text-bia-muted">Run the Banzami certification suite against any operator endpoint.</p>
        </div>

        {/* Certification levels */}
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-bia-border">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Certification levels</div>
          </div>
          <div className="divide-y divide-bia-border">
            {CERT_LEVELS.map(l => (
              <button
                key={l.level}
                onClick={() => setLevel(l.level)}
                className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors ${
                  level === l.level ? 'bg-bia-primary-glow' : 'hover:bg-bia-surface-2'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                  level === l.level ? 'bg-bia-primary text-white' : 'bg-bia-surface-2 text-bia-muted'
                }`}>{l.level}</span>
                <div>
                  <div className="text-sm font-medium text-bia-text">{l.name}</div>
                  <div className="text-xs text-bia-muted">{l.suites}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Run form */}
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-3">
          <label className="text-xs font-medium text-bia-muted">Operator endpoint URL</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://your-operator.com"
            className="w-full rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 text-sm text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
          />
          <button
            onClick={run}
            disabled={running || !url.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-bia-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {running ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running Level {level} conformance…
              </>
            ) : (
              `Run Level ${level} conformance suite`
            )}
          </button>
          {mode === 'demo' && (
            <p className="text-center text-[11px] text-bia-muted-2">Demo mode — connect BanzamIA API for real execution</p>
          )}
        </div>

        {/* Demo result */}
        {result === 'demo' && (
          <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-bia-border bg-bia-surface-2">
              <div className="text-sm font-semibold text-bia-text">Result — Level {level} (demo)</div>
              <span className="rounded-full bg-bia-gold/10 border border-bia-gold/30 px-2.5 py-0.5 text-xs font-semibold text-bia-gold">DEMO</span>
            </div>
            <div className="p-4 space-y-2">
              {['health', 'wallets', 'transfers', ...(level >= 1 ? ['qr', 'ledger', 'settlement'] : []), ...(level >= 2 ? ['traces'] : [])].map(suite => (
                <div key={suite} className="flex items-center gap-3 rounded-lg bg-bia-surface-2 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-bia-green shrink-0" />
                  <span className="flex-1 text-sm font-mono text-bia-text">{suite}</span>
                  <span className="text-xs font-semibold text-bia-green">PASS</span>
                </div>
              ))}
              <div className="mt-3 rounded-lg border border-bia-green/30 bg-bia-green/5 px-3 py-2.5 text-center">
                <div className="text-sm font-bold text-bia-green">Level {level} — Certified</div>
                <div className="text-xs text-bia-muted mt-0.5">Connect BanzamIA API for real certification report</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
