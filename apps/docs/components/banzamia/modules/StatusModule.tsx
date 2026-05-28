'use client'

import { useEffect, useState } from 'react'
import { getSystemStatus, type SystemStatus } from '@/lib/banzamia-client'

const STATUS_ROWS: Array<{ key: keyof SystemStatus; label: string; values: Record<string, { color: string; label: string }> }> = [
  {
    key: 'mode',
    label: 'Mode',
    values: {
      demo: { color: 'text-bia-amber', label: 'Demo' },
      live: { color: 'text-bia-green', label: 'Live' },
    },
  },
  {
    key: 'api',
    label: 'API server',
    values: {
      ok:          { color: 'text-bia-green', label: 'Operational' },
      unavailable: { color: 'text-bia-muted', label: 'Unavailable' },
    },
  },
  {
    key: 'modelRouter',
    label: 'Model router',
    values: {
      ok:          { color: 'text-bia-green', label: 'Routing' },
      unavailable: { color: 'text-bia-muted', label: 'Unavailable' },
    },
  },
  {
    key: 'knowledgeBase',
    label: 'Knowledge base',
    values: {
      indexed:     { color: 'text-bia-green', label: 'Indexed' },
      'not-indexed':{ color: 'text-bia-amber', label: 'Not indexed' },
      unavailable: { color: 'text-bia-muted', label: 'Unavailable' },
    },
  },
  {
    key: 'tools',
    label: 'Tools',
    values: {
      available: { color: 'text-bia-green', label: 'Available' },
      demo:      { color: 'text-bia-amber', label: 'Demo only' },
    },
  },
  {
    key: 'conformanceRunner',
    label: 'Conformance runner',
    values: {
      available: { color: 'text-bia-green', label: 'Available' },
      demo:      { color: 'text-bia-amber', label: 'Demo only' },
    },
  },
]

const MODELS = [
  { name: 'Qwen 14B', task: 'Protocol docs, explanation', provider: 'vLLM / RunPod RTX 4090' },
  { name: 'Qwen Coder 7B', task: 'Code generation, SDK examples', provider: 'vLLM / RunPod RTX 4090' },
  { name: 'DeepSeek R1-Distill', task: 'Deep reasoning, invariant debugging', provider: 'vLLM / RunPod RTX 4090' },
  { name: 'Orchestrator', task: 'Certification, validation', provider: 'Tool-augmented routing' },
]

export function StatusModule() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    getSystemStatus().then(setStatus)
  }, [])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">System Status</h2>
          <p className="text-sm text-bia-muted">BanzamIA infrastructure and model availability.</p>
        </div>

        {/* Status table */}
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Component status</div>
          </div>
          <div className="divide-y divide-bia-border">
            {STATUS_ROWS.map(row => {
              const val = status?.[row.key] as string | undefined
              const info = val ? (row.values[val] ?? { color: 'text-bia-muted', label: val }) : null
              return (
                <div key={row.key} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-bia-muted">{row.label}</span>
                  {info ? (
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        info.color.includes('green') ? 'bg-bia-green' :
                        info.color.includes('amber') ? 'bg-bia-amber' : 'bg-bia-border'
                      }`} />
                      <span className={`text-sm font-medium ${info.color}`}>{info.label}</span>
                    </div>
                  ) : (
                    <span className="h-4 w-20 animate-pulse rounded bg-bia-surface-2" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Model registry */}
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Model registry</div>
          </div>
          <div className="divide-y divide-bia-border">
            {MODELS.map(m => (
              <div key={m.name} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-bia-text">{m.name}</span>
                  <span className="text-[10px] font-mono text-bia-muted">{m.provider}</span>
                </div>
                <div className="mt-0.5 text-xs text-bia-muted">{m.task}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture note */}
        <div className="rounded-xl border border-bia-border bg-bia-surface-2 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2 mb-1.5">Cold-start architecture</div>
          <p className="text-xs text-bia-muted leading-relaxed">
            BanzamIA runs GPU inference on-demand on RunPod RTX 4090 via vLLM. No 24/7 GPU cost. First response after inactivity may take 30–90 seconds while the model loads. Subsequent responses are fast.
          </p>
        </div>
      </div>
    </div>
  )
}
