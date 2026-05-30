'use client'

import type { Citation } from '@/lib/banzai-client'

interface Props {
  citations: Citation[]
  model: string
  taskType: string
  isStreaming: boolean
  mode: 'demo' | 'live'
}

const CITATION_COLORS: Record<Citation['type'], string> = {
  rfc:       'text-bia-gold border-bia-gold/40 bg-amber-50',
  adr:       'text-blue-700 border-blue-200 bg-blue-50',
  api:       'text-violet-700 border-violet-200 bg-violet-50',
  invariant: 'text-bia-primary border-bia-primary/30 bg-bia-primary/5',
  file:      'text-bia-muted border-bia-border bg-bia-surface-2',
  vector:    'text-bia-green border-green-200 bg-green-50',
}

const CITATION_ICONS: Record<Citation['type'], string> = {
  rfc:       'RFC',
  adr:       'ADR',
  api:       'API',
  invariant: 'INV',
  file:      'SRC',
  vector:    'VEC',
}

const MODEL_LABELS: Record<string, { label: string; color: string }> = {
  'qwen-14b':      { label: 'Qwen 14B',      color: 'text-blue-700' },
  'qwen-coder-7b': { label: 'Qwen Coder 7B', color: 'text-violet-700' },
  'deepseek-r1':   { label: 'DeepSeek R1',   color: 'text-bia-gold' },
  'orchestrator':  { label: 'Orchestrator',  color: 'text-bia-green' },
}

const TASK_LABELS: Record<string, string> = {
  DOCS:     'Protocol docs',
  CODE:     'Code generation',
  REASON:   'Deep reasoning',
  VALIDATE: 'Validation',
  CERTIFY:  'Certification',
}

export function BanzAISourcesPanel({ citations, model, taskType, isStreaming, mode }: Props) {
  const modelInfo = MODEL_LABELS[model] ?? { label: model, color: 'text-bia-muted' }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-bia-border bg-bia-surface-2">
      {/* Header */}
      <div className="flex h-14 items-center border-b border-bia-border px-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-bia-muted">Sources & Context</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Model routing */}
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Model route</div>
          <div className="rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              {isStreaming && (
                <span className="h-1.5 w-1.5 rounded-full bg-bia-green animate-pulse shrink-0" />
              )}
              <span className={`text-sm font-semibold ${modelInfo.color}`}>{modelInfo.label}</span>
            </div>
            {taskType && (
              <div className="text-[11px] text-bia-muted">{TASK_LABELS[taskType] ?? taskType}</div>
            )}
            {!model && (
              <div className="text-[11px] text-bia-muted-2 italic">Awaiting first message…</div>
            )}
          </div>
        </div>

        {/* Citations */}
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Citations</div>
          {citations.length === 0 ? (
            <div className="rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-4 text-center">
              <div className="text-[11px] text-bia-muted-2 italic">Citations will appear here</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {citations.map((c, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${CITATION_COLORS[c.type]}`}
                >
                  <span className="mt-px shrink-0 rounded px-1 py-px text-[9px] font-bold border border-current/30 bg-current/10">
                    {CITATION_ICONS[c.type]}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium leading-tight">{c.label}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] opacity-60">{c.ref}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grounding principle */}
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2">Grounding</div>
          <div className="rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2.5 space-y-1.5">
            <div className="flex items-start gap-2 text-[11px] text-bia-muted">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bia-green" />
              <span>Protocol claims cite RFC or ADR</span>
            </div>
            <div className="flex items-start gap-2 text-[11px] text-bia-muted">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bia-green" />
              <span>Invariant violations are hard findings</span>
            </div>
            <div className="flex items-start gap-2 text-[11px] text-bia-muted">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bia-green" />
              <span>Certification requires tool result, not AI inference</span>
            </div>
          </div>
        </div>

        {/* Mode indicator */}
        <div className="rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2 mb-1.5">Mode</div>
          <div className={`text-xs font-medium ${mode === 'live' ? 'text-bia-green' : 'text-bia-amber'}`}>
            {mode === 'live' ? '⬤ Live — connected to BanzAI API' : '◯ Demo — set NEXT_PUBLIC_BANZAMIA_API_URL for live mode'}
          </div>
        </div>
      </div>
    </aside>
  )
}
