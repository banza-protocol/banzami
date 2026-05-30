'use client'

import Link from 'next/link'
import { type Citation } from '@/lib/banzai-client'

interface Props {
  text: string
  streaming: boolean
  citations: Citation[]
  mode: string
  question: string
}

const MODE_BADGE: Record<string, { label: string; cls: string }> = {
  demo:               { label: 'Demo Mode', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  mock:               { label: 'Live API',  cls: 'bg-bz-primary-light text-bz-primary border-bz-primary/20' },
  'mock-placeholder': { label: 'Live API',  cls: 'bg-bz-primary-light text-bz-primary border-bz-primary/20' },
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="rounded border border-bz-border bg-bz-surface px-1 py-px font-mono text-[11px] text-bz-primary">{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-bz-text">{part.slice(2, -2)}</strong>
    return part
  })
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.startsWith('```')) {
      const lang = line.slice(3)
      const codeLines: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '')
        i++
      }
      elements.push(
        <pre key={i} className="my-2 overflow-x-auto rounded-lg border border-bz-border bg-bz-text/[0.04] p-3 text-[11px] font-mono text-bz-text leading-relaxed">
          {lang && <div className="mb-1.5 text-[10px] uppercase tracking-wider text-bz-muted">{lang}</div>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++
      continue
    }

    if (line.startsWith('## ') || line.startsWith('### ')) {
      const level = line.startsWith('## ') ? 3 : 4
      const content = line.slice(level)
      elements.push(
        <p key={i} className={`${level === 3 ? 'mt-3 mb-1 font-bold' : 'mt-2 mb-0.5 font-semibold'} text-sm text-bz-text`}>
          {content}
        </p>
      )
      i++; continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) {
        tableLines.push(lines[i] ?? '')
        i++
      }
      const rows = tableLines.filter(l => !l.match(/^\|[-| ]+\|$/))
      elements.push(
        <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-lg border border-bz-border text-[11px]">
          <table className="w-full">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? 'bg-bz-surface' : 'border-t border-bz-border'}>
                  {row.split('|').filter((_, ci, a) => ci > 0 && ci < a.length - 1).map((cell, ci) =>
                    ri === 0
                      ? <th key={ci} className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-bz-text whitespace-nowrap">{cell.trim()}</th>
                      : <td key={ci} className="px-2.5 py-1.5 text-bz-muted">{renderInline(cell.trim())}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (line.trim() === '') { elements.push(<div key={i} className="h-1" />); i++; continue }

    elements.push(
      <p key={i} className="text-sm leading-relaxed text-bz-text">{renderInline(line)}</p>
    )
    i++
  }

  return <>{elements}</>
}

export function QuickAnswerCard({ text, streaming, citations, mode, question }: Props) {
  const badge = MODE_BADGE[mode] ?? { label: 'Live API', cls: 'bg-bz-primary-light text-bz-primary border-bz-primary/20' }
  const deepLink = `/banzamia?question=${encodeURIComponent(question)}&auto=1`

  return (
    <div className="mt-5 rounded-2xl border border-bz-primary/20 bg-white shadow-card-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-bz-border bg-bz-surface">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-bz-primary" />
          <span className="text-xs font-semibold text-bz-text">BanzAI</span>
        </div>
        <span className={`rounded-full border px-2 py-px text-[10px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Answer body */}
      <div className="max-h-64 overflow-y-auto px-5 py-4 space-y-px">
        <InlineMarkdown text={text} />
        {streaming && (
          <span className="inline-block h-4 w-0.5 bg-bz-primary animate-pulse ml-0.5 align-middle" />
        )}
      </div>

      {/* Footer: source chips + continue link */}
      {!streaming && (
        <div className="border-t border-bz-border px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {citations.slice(0, 4).map((c, i) => (
              <span key={i} className="rounded-full border border-bz-border bg-bz-surface px-2.5 py-0.5 text-[10px] font-medium text-bz-muted">
                {c.label}
              </span>
            ))}
          </div>
          <Link
            href={deepLink}
            className="text-xs font-semibold text-bz-primary hover:underline whitespace-nowrap"
          >
            Continuar no BanzAI completo →
          </Link>
        </div>
      )}
    </div>
  )
}
