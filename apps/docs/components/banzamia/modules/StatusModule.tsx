'use client'

import { useEffect, useState } from 'react'
import { getSystemStatus, type SystemStatus } from '@/lib/banzamia-client'

const MODE_LABELS: Record<string, { color: string; label: string }> = {
  demo:                { color: 'text-bia-amber', label: 'Demo' },
  'live-api-no-model': { color: 'text-bia-amber', label: 'Live API — No Model' },
  'live-ai':           { color: 'text-bia-green', label: 'Live AI' },
}

const MODEL_STATUS_STYLE: Record<string, string> = {
  configured:     'text-bia-green',
  not_configured: 'text-bia-muted',
}

const TOOL_STATUS_STYLE: Record<string, string> = {
  available:      'text-bia-green',
  not_configured: 'text-bia-amber',
}

const MODEL_ENTRIES = [
  { key: 'qwen',       name: 'Qwen2.5-14B-Instruct',           task: 'Protocol docs, explanation' },
  { key: 'qwen_coder', name: 'Qwen2.5-Coder-7B-Instruct',      task: 'Code generation, SDK examples' },
  { key: 'deepseek',   name: 'DeepSeek-R1-Distill-Qwen-14B',   task: 'Reasoning, invariant debugging, certification' },
]

const TOOL_ENTRIES = [
  { key: 'manifest_validator',  label: 'Manifest Validator' },
  { key: 'conformance_runner',  label: 'Conformance Runner' },
  { key: 'trace_explainer',     label: 'Trace Explainer' },
  { key: 'sdk_generator',       label: 'SDK Generator' },
  { key: 'knowledge_search',    label: 'Knowledge Search' },
]

function StatusDot({ color }: { color: string }) {
  const bg = color.includes('green') ? 'bg-bia-green' : color.includes('amber') ? 'bg-bia-amber' : 'bg-bia-border'
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${bg}`} />
}

function Skeleton() {
  return <span className="h-4 w-16 animate-pulse rounded bg-bia-surface-2" />
}

export function StatusModule() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSystemStatus().then(s => { setStatus(s); setLoading(false) })
  }, [])

  const modeInfo = status ? (MODE_LABELS[status.mode] ?? { color: 'text-bia-muted', label: status.mode }) : null

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">System Status</h2>
          <p className="text-sm text-bia-muted">BanzamIA infrastructure, model availability, and tool status.</p>
        </div>

        {/* Mode + API */}
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Infrastructure</div>
          </div>
          <div className="divide-y divide-bia-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-bia-muted">Mode</span>
              {loading || !modeInfo ? <Skeleton /> : (
                <div className="flex items-center gap-2">
                  <StatusDot color={modeInfo.color} />
                  <span className={`text-sm font-medium ${modeInfo.color}`}>{modeInfo.label}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-bia-muted">API server</span>
              {loading || !status ? <Skeleton /> : (
                <div className="flex items-center gap-2">
                  <StatusDot color={status.api === 'ok' ? 'text-bia-green' : 'text-bia-border'} />
                  <span className={`text-sm font-medium ${status.api === 'ok' ? 'text-bia-green' : 'text-bia-muted'}`}>
                    {status.api === 'ok' ? 'Operational' : 'Unavailable'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-bia-muted">Provider</span>
              {loading || !status ? <Skeleton /> : (
                <div className="flex items-center gap-2">
                  <StatusDot color={status.provider?.available ? 'text-bia-green' : 'text-bia-amber'} />
                  <span className="text-sm font-medium text-bia-text font-mono">{status.provider?.name ?? '—'}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-bia-muted">Knowledge index</span>
              {loading || !status ? <Skeleton /> : (
                <div className="flex items-center gap-2">
                  <StatusDot color={status.rag?.index === 'configured' ? 'text-bia-green' : 'text-bia-amber'} />
                  <span className={`text-sm font-medium ${status.rag?.index === 'configured' ? 'text-bia-green' : 'text-bia-amber'}`}>
                    {status.rag?.index === 'configured' ? `Qdrant (${status.rag.backend})` : 'Keyword (no Qdrant)'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Model registry */}
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Model registry</div>
          </div>
          <div className="divide-y divide-bia-border">
            {MODEL_ENTRIES.map(m => {
              const val = status?.models?.[m.key as keyof typeof status.models]
              const color = val ? (MODEL_STATUS_STYLE[val] ?? 'text-bia-muted') : 'text-bia-border'
              const label = val === 'configured' ? 'Configured' : val === 'not_configured' ? 'Not configured' : '—'
              return (
                <div key={m.key} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-bia-text font-mono">{m.name}</span>
                    {loading || !status ? <Skeleton /> : (
                      <div className="flex items-center gap-2">
                        <StatusDot color={color} />
                        <span className={`text-[11px] font-medium ${color}`}>{label}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-bia-muted">{m.task}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tools */}
        <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-bia-border bg-bia-surface-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Deterministic tools</div>
          </div>
          <div className="divide-y divide-bia-border">
            {TOOL_ENTRIES.map(t => {
              const val   = status?.tools?.[t.key]
              const color = val ? (TOOL_STATUS_STYLE[val] ?? 'text-bia-muted') : 'text-bia-border'
              const label = val === 'available' ? 'Available' : val === 'not_configured' ? 'Not configured' : val ?? '—'
              return (
                <div key={t.key} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-bia-muted">{t.label}</span>
                  {loading || !status ? <Skeleton /> : (
                    <div className="flex items-center gap-2">
                      <StatusDot color={color} />
                      <span className={`text-sm font-medium ${color}`}>{label}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Architecture note */}
        <div className="rounded-xl border border-bia-border bg-bia-surface-2 px-4 py-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Deployment modes</div>
          {[
            { label: 'Demo', desc: 'Frontend only. No API. All responses simulated in browser.' },
            { label: 'Live API — No Model', desc: 'Real backend + deterministic tools + mock model. Current mode.' },
            { label: 'Live AI', desc: 'Real backend + RunPod/vLLM GPU models. Available when BANZAMIA_*_URL env vars are set.' },
          ].map(row => (
            <div key={row.label} className="text-xs text-bia-muted leading-relaxed">
              <span className="font-semibold text-bia-text">{row.label}: </span>
              {row.desc}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
