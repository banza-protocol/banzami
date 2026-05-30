'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BanzAIIcon } from './banzai/BanzAIIcon'

const QUICK_PROMPTS = [
  'Como integrar o Banzami?',
  'Como funciona a certificação?',
  'O que é um operador?',
  'Como funciona a federação?',
  'Gerar manifesto sandbox.',
  'Como funciona a liquidação?',
  'O que é um trace_id?',
]

export function HeroBanzAIWidget() {
  const [input, setInput] = useState('')
  const router = useRouter()

  const submit = (question: string) => {
    const q = question.trim()
    if (!q) return
    router.push(`/banzai?question=${encodeURIComponent(q)}&auto=1`)
  }

  return (
    <div className="mx-auto mb-10 max-w-2xl text-left">
      <div className="overflow-hidden rounded-2xl border border-bz-border bg-white shadow-card-lg">

        {/* Card header */}
        <div
          className="flex items-center gap-3 border-b border-bz-border px-5 py-4"
          style={{ background: 'linear-gradient(105deg, rgba(153,0,17,0.03) 0%, transparent 55%)' }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bz-primary"
            style={{ boxShadow: '0 2px 10px rgba(153,0,17,0.30)' }}
          >
            <BanzAIIcon size={18} className="text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-tight text-bz-text">Pergunte ao BanzAI</p>
            <p className="mt-0.5 text-[11px] leading-snug text-bz-muted">
              O Sistema Operativo do Protocolo Banza.
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-bz-primary/20 bg-bz-primary-light px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-bz-primary">
            BanzAI
          </span>
        </div>

        {/* Card body */}
        <div className="px-5 pb-4 pt-4">
          {/* Suggestion chips — single scrollable row above input */}
          <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                className="shrink-0 whitespace-nowrap rounded-full border border-bz-border bg-white px-3 py-1.5 text-xs font-medium text-bz-muted transition-colors hover:border-bz-primary/40 hover:bg-bz-primary-light hover:text-bz-primary"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input + submit */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.slice(0, 500))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(input) } }}
              placeholder="Como posso integrar o Banzami no meu produto?"
              className="min-w-0 flex-1 rounded-xl border border-bz-border bg-bz-bg px-4 py-2.5 text-sm text-bz-text placeholder-bz-muted outline-none transition-all focus:border-bz-primary/40 focus:bg-white focus:ring-2 focus:ring-bz-primary/10"
            />
            <button
              type="button"
              onClick={() => submit(input)}
              disabled={!input.trim()}
              className="shrink-0 rounded-xl bg-bz-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-35"
              style={{ boxShadow: '0 2px 8px rgba(153,0,17,0.28)' }}
            >
              Perguntar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
