'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { chatStream, isLiveMode, type Citation } from '@/lib/banzamia-client'
import { BanzamIAIcon } from './BanzamIAIcon'
import { QuickPromptChip } from './QuickPromptChip'
import { QuickAnswerCard } from './QuickAnswerCard'

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

const QUICK_PROMPTS = [
  'O que é o Banzami?',
  'Qual é a diferença entre Banzami e Banza?',
  'Como integrar pagamentos QR?',
  'Como certificar um operador?',
  'O que são invariantes financeiros?',
  'Como funciona o sandbox operator?',
]

export function HomeBanzamIAEntry() {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [mode, setMode] = useState<string>(isLiveMode ? 'mock' : 'demo')
  const [currentQuestion, setCurrentQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || status === 'loading' || status === 'streaming') return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setCurrentQuestion(q)
    setAnswer('')
    setCitations([])
    setStatus('loading')
    setMode(isLiveMode ? 'mock' : 'demo')

    try {
      let started = false

      await chatStream(
        [{ role: 'user', content: q }],
        (chunk, meta) => {
          if (meta?.actual_provider) setMode(meta.actual_provider)
          if (chunk) {
            if (!started) { started = true; setStatus('streaming') }
            setAnswer(prev => prev + chunk)
          }
        },
        (c) => setCitations(c),
        controller.signal,
      )

      setStatus('done')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setStatus('error')
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); ask(input) }
  }

  const isActive = status === 'loading' || status === 'streaming'

  return (
    <section className="px-5 pb-4 md:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-bz-border bg-white shadow-card-lg p-6 md:p-8">

          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bz-primary shadow-primary">
              <BanzamIAIcon size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-bz-text tracking-tight">Pergunte ao BanzAI</h2>
              <p className="mt-0.5 text-xs text-bz-muted max-w-lg">
                O Sistema Operativo do Protocolo Banza — para entender, integrar e validar o ecossistema Banzami.
              </p>
            </div>
          </div>

          {/* Quick prompts — horizontally scrollable */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {QUICK_PROMPTS.map((p) => (
              <QuickPromptChip
                key={p}
                label={p}
                onClick={(label) => { setInput(label); ask(label) }}
              />
            ))}
          </div>

          {/* Input + submit */}
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.slice(0, 500))}
              onKeyDown={handleKey}
              placeholder="Pergunte sobre QR, SDKs, operadores, certificação, invariantes…"
              disabled={isActive}
              maxLength={500}
              className="min-w-0 flex-1 rounded-xl border border-bz-border bg-bz-bg px-4 py-3 text-sm text-bz-text placeholder-bz-muted outline-none transition-colors focus:border-bz-primary/50 focus:ring-2 focus:ring-bz-primary/10 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => ask(input)}
              disabled={isActive || !input.trim()}
              className="shrink-0 rounded-xl bg-bz-primary px-5 py-3 text-sm font-semibold text-white shadow-primary transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isActive ? '…' : 'Perguntar'}
            </button>
          </div>

          {/* Status bar */}
          <div className="mt-3 flex items-center justify-between px-0.5">
            <span className="text-[11px]">
              {!isLiveMode && <span className="text-amber-600 font-medium">◯ Demo Mode</span>}
            </span>
            <Link href="/banzamia" className="text-[11px] font-semibold text-bz-muted hover:text-bz-primary transition-colors">
              Abrir BanzAI completo →
            </Link>
          </div>

          {/* Loading */}
          {status === 'loading' && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-bz-border bg-bz-surface px-5 py-4">
              <div className="flex gap-1">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 rounded-full bg-bz-primary animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
              <span className="text-sm text-bz-muted">BanzAI está a consultar o protocolo…</span>
            </div>
          )}

          {/* Answer */}
          {(status === 'streaming' || status === 'done') && answer && (
            <QuickAnswerCard
              text={answer}
              streaming={status === 'streaming'}
              citations={citations}
              mode={mode}
              question={currentQuestion}
            />
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="mt-5 rounded-xl border border-bz-border bg-bz-surface px-5 py-4">
              <p className="text-sm text-bz-muted">
                Não consegui contactar a API agora.{' '}
                <Link href="/banzamia" className="font-semibold text-bz-primary hover:underline">
                  Pode abrir o BanzAI completo
                </Link>{' '}
                ou tentar novamente.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
