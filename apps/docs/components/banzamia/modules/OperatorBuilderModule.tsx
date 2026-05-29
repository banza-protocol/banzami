'use client'

import { useState } from 'react'

const STEPS = [
  {
    step: 1,
    title: 'Choose certification target',
    description: 'What certification level are you targeting?',
  },
  {
    step: 2,
    title: 'Define capabilities',
    description: 'Which protocol features will your operator support?',
  },
  {
    step: 3,
    title: 'Generate manifest',
    description: 'Preview and download your operator.json manifest.',
  },
]

const CAPABILITIES = [
  { key: 'supports_wallets',    label: 'Wallets',    level: 0, required: true },
  { key: 'supports_transfers',  label: 'Transfers',  level: 0, required: true },
  { key: 'supports_qr',         label: 'QR Payments',level: 1 },
  { key: 'supports_traces',     label: 'Traces',     level: 2 },
  { key: 'supports_settlement', label: 'Settlement', level: 4 },
  { key: 'supports_webhooks',   label: 'Webhooks',   level: 1 },
  { key: 'supports_federation', label: 'Federation', level: 3 },
]

export function OperatorBuilderModule() {
  const [currentStep, setCurrentStep] = useState(1)
  const [targetLevel, setTargetLevel] = useState(2)
  const [operatorId, setOperatorId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [caps, setCaps] = useState<Record<string, boolean>>({
    supports_wallets: true,
    supports_transfers: true,
    supports_qr: false,
    supports_traces: false,
    supports_settlement: false,
    supports_webhooks: false,
    supports_federation: false,
  })

  const toggleCap = (key: string) => {
    const cap = CAPABILITIES.find(c => c.key === key)
    if (cap?.required) return
    setCaps(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const manifest = {
    operator_id: operatorId || 'op_your_id',
    display_name: displayName || 'Your Operator',
    environment,
    simulated: environment === 'sandbox',
    production_allowed: environment !== 'sandbox',
    certification_level: targetLevel,
    protocol_version: '1.0.0',
    capabilities: caps,
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Operator Builder</h2>
          <p className="text-sm text-bia-muted">Step-by-step guide to building and certifying a Banza protocol operator.</p>
        </div>

        {/* Step nav */}
        <div className="flex gap-2">
          {STEPS.map(s => (
            <button
              key={s.step}
              onClick={() => setCurrentStep(s.step)}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                currentStep === s.step
                  ? 'border-bia-primary/30 bg-bia-primary-glow'
                  : 'border-bia-border bg-bia-surface hover:bg-bia-surface-2'
              }`}
            >
              <div className={`text-[10px] font-bold mb-0.5 ${currentStep === s.step ? 'text-bia-primary' : 'text-bia-muted'}`}>
                STEP {s.step}
              </div>
              <div className="text-xs font-medium text-bia-text leading-tight">{s.title}</div>
            </button>
          ))}
        </div>

        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-bia-muted">Operator ID</label>
                <input
                  value={operatorId}
                  onChange={e => setOperatorId(e.target.value)}
                  placeholder="op_yourcompany"
                  className="w-full rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm font-mono text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-bia-muted">Display name</label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Acme Financial"
                  className="w-full rounded-lg border border-bia-border bg-bia-surface px-3 py-2 text-sm text-bia-text placeholder-bia-muted-2 outline-none focus:border-bia-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-bia-muted">Environment</label>
              <div className="flex gap-2">
                {(['sandbox', 'production'] as const).map(env => (
                  <button
                    key={env}
                    onClick={() => setEnvironment(env)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      environment === env
                        ? env === 'sandbox' ? 'border-bia-amber/30 bg-bia-amber/5 text-bia-amber' : 'border-bia-green/30 bg-bia-green/5 text-bia-green'
                        : 'border-bia-border bg-bia-surface text-bia-muted hover:bg-bia-surface-2'
                    }`}
                  >
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </button>
                ))}
              </div>
              {environment === 'sandbox' && (
                <p className="mt-2 text-[11px] text-bia-amber">
                  Sandbox operators automatically get <code className="font-mono">simulated: true</code> and <code className="font-mono">production_allowed: false</code> (safety invariant).
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-bia-muted">Target certification level</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map(l => (
                  <button
                    key={l}
                    onClick={() => setTargetLevel(l)}
                    className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                      targetLevel === l ? 'border-bia-primary bg-bia-primary text-white' : 'border-bia-border bg-bia-surface text-bia-muted hover:bg-bia-surface-2'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setCurrentStep(2)}
              className="w-full rounded-lg bg-bia-primary py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Next — Define capabilities
            </button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Protocol capabilities</div>
              </div>
              <div className="divide-y divide-bia-border">
                {CAPABILITIES.map(cap => {
                  const enabled = caps[cap.key]
                  const isRequired = cap.required
                  return (
                    <div key={cap.key} className="flex items-center gap-4 px-4 py-3">
                      <button
                        onClick={() => toggleCap(cap.key)}
                        disabled={isRequired}
                        className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
                          enabled ? 'bg-bia-primary' : 'bg-bia-border'
                        } ${isRequired ? 'cursor-not-allowed opacity-70' : ''}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                      <div className="flex-1">
                        <div className="text-sm text-bia-text">{cap.label}</div>
                        <div className="text-[11px] text-bia-muted">Level {cap.level}+{isRequired ? ' · Required' : ''}</div>
                      </div>
                      {cap.level <= targetLevel ? (
                        <span className="text-[10px] text-bia-green font-medium">Required for L{targetLevel}</span>
                      ) : (
                        <span className="text-[10px] text-bia-muted">Optional</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setCurrentStep(1)} className="flex-1 rounded-lg border border-bia-border py-2.5 text-sm text-bia-muted hover:bg-bia-surface-2">Back</button>
              <button onClick={() => setCurrentStep(3)} className="flex-1 rounded-lg bg-bia-primary py-2.5 text-sm font-semibold text-white hover:opacity-90">Next — Generate manifest</button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-bia-border bg-bia-bg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-bia-border bg-bia-surface">
                <span className="font-mono text-[11px] text-bia-muted">operator.json</span>
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(manifest, null, 2))}
                  className="text-[11px] text-bia-muted hover:text-bia-text"
                >
                  Copy
                </button>
              </div>
              <pre className="p-4 text-[12px] leading-relaxed text-bia-text font-mono overflow-x-auto">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            </div>

            <div className="rounded-xl border border-bia-border bg-bia-surface px-4 py-3 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2 mb-2">Next steps</div>
              {['Serve this manifest at /.well-known/banzami/operator.json', `Implement the required API endpoints for Level ${targetLevel}`, 'Run the conformance suite to validate your implementation', 'Submit for official certification'].map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-bia-muted">
                  <span className="mt-px h-4 w-4 shrink-0 rounded-full border border-bia-border bg-bia-surface-2 flex items-center justify-center text-[9px] font-bold text-bia-muted">{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>

            <button onClick={() => setCurrentStep(1)} className="w-full rounded-lg border border-bia-border py-2.5 text-sm text-bia-muted hover:bg-bia-surface-2">Start over</button>
          </div>
        )}
      </div>
    </div>
  )
}
