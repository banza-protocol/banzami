'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { chatStream, type ChatMessage, type Citation, isLiveMode } from '@/lib/banzamia-client'
import { BanzamIAIcon } from './BanzamIAIcon'

interface Message extends ChatMessage {
  id: string
  citations?: Citation[]
  model?: string
  taskType?: string
  streaming?: boolean
}

interface Props {
  onCitationsChange: (citations: Citation[]) => void
  onModelChange: (model: string, taskType: string) => void
  onStreamingChange: (streaming: boolean) => void
  initialQuestion?: string
  autoSubmit?: boolean
}

const EXAMPLE_QUESTIONS = [
  'Como funciona a propagação de trace_id no protocolo?',
  'Explica os invariantes financeiros INV-STL-001 e INV-LEDGER-001',
  'Gera código TypeScript SDK para criar um pagamento QR',
  'Quais são os níveis de certificação de operadores?',
  'Valida a estrutura de um manifesto sandbox operator',
]

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-bia-primary px-4 py-2.5">
          <p className="text-sm text-white leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {/* AI avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bia-primary shadow-bia-glow mt-0.5">
        <BanzamIAIcon size={16} className="text-white" />
      </div>

      <div className="min-w-0 flex-1">
        {/* Model label */}
        {message.model && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-bia-gold">
              {message.model}
            </span>
            {message.taskType && (
              <span className="rounded px-1.5 py-px text-[9px] font-medium bg-bia-surface-2 text-bia-muted border border-bia-border">
                {message.taskType}
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="prose-sm rounded-2xl rounded-tl-sm border border-bia-border bg-white px-4 py-3 text-bia-text shadow-sm">
          {message.streaming && message.content === '' ? (
            <div className="flex gap-1 py-1">
              <span className="h-2 w-2 rounded-full bg-bia-muted animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-bia-muted animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-bia-muted animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <MarkdownContent content={message.content} />
          )}
          {message.streaming && message.content && (
            <span className="inline-block h-4 w-0.5 bg-bia-muted animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3)
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} className="my-3 overflow-x-auto rounded-lg bg-bia-surface-2 border border-bia-border p-3 text-[12px] text-bia-text font-mono leading-relaxed">
          {lang && <div className="mb-2 text-[10px] uppercase tracking-wider text-bia-muted">{lang}</div>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++
      continue
    }

    // H2/H3
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="mt-4 mb-2 text-sm font-bold text-bia-text">{line.slice(3)}</h2>)
      i++; continue
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="mt-3 mb-1.5 text-sm font-semibold text-bia-text">{line.slice(4)}</h3>)
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = tableLines.filter(l => !l.match(/^\|[-| ]+\|$/))
      elements.push(
        <div key={i} className="my-3 overflow-x-auto rounded-lg border border-bia-border">
          <table className="w-full text-[12px]">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? 'bg-bia-surface-2' : 'border-t border-bia-border'}>
                  {row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1).map((cell, ci) => (
                    ri === 0
                      ? <th key={ci} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-bia-muted whitespace-nowrap">{cell.trim()}</th>
                      : <td key={ci} className="px-3 py-2 text-bia-text">{renderInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
      i++; continue
    }

    // Bold heading line (** text **)
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-bia-text">
        {renderInline(line)}
      </p>
    )
    i++
  }

  return <>{elements}</>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded bg-bia-surface-2 border border-bia-border px-1 py-px font-mono text-[11px] text-bia-primary">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-bia-text">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export function BanzamIAChat({ onCitationsChange, onModelChange, onStreamingChange, initialQuestion, autoSubmit }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const initialHandledRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle ?question=...&auto=1 deep link
  useEffect(() => {
    if (!initialQuestion || initialHandledRef.current) return
    initialHandledRef.current = true
    if (autoSubmit) {
      const id = setTimeout(() => sendMessage(initialQuestion), 150)
      return () => clearTimeout(id)
    } else {
      setInput(initialQuestion)
    }
  // sendMessage identity is stable at mount; initialQuestion/autoSubmit won't change after navigation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsStreaming(true)
    onStreamingChange(true)

    const controller = new AbortController()
    abortRef.current = controller

    const history: ChatMessage[] = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      await chatStream(
        history,
        (chunk, meta) => {
          if (meta) {
            onModelChange(meta.model, meta.taskType)
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, model: meta.model, taskType: meta.taskType } : m
            ))
          }
          setMessages(prev => prev.map(m =>
            m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m
          ))
        },
        (citations) => {
          onCitationsChange(citations)
          setMessages(prev => prev.map(m =>
            m.id === assistantMsg.id ? { ...m, citations } : m
          ))
        },
        controller.signal,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: 'Erro ao conectar com BanzamIA. Verifique a configuração do endpoint.', streaming: false }
            : m
        ))
      }
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, streaming: false } : m
      ))
      setIsStreaming(false)
      onStreamingChange(false)
    }
  }, [isStreaming, messages, onCitationsChange, onModelChange, onStreamingChange])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Welcome screen
  if (messages.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col overflow-hidden">
        {/* Hero — min-h-0 + overflow-y-auto so it shrinks when composer grows */}
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center p-8 overflow-y-auto overscroll-contain">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-bia-primary shadow-bia-glow">
            <BanzamIAIcon size={32} className="text-white" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-bia-text tracking-tight">BanzamIA</h1>
          <p className="mb-1 text-sm text-bia-muted text-center max-w-md">
            BanzamIA é o Sistema Operativo do Protocolo Banzami. 16 módulos. Ferramentas determinam a verdade. A IA explica a verdade.
          </p>
          <p className="mb-8 text-xs text-bia-muted-2 text-center italic">
            Tools determine truth. AI explains truth.
          </p>

          {/* Example questions */}
          <div className="w-full max-w-xl space-y-2">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-bia-muted-2 text-center">
              Exemplos de perguntas
            </div>
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                className="flex w-full items-start gap-3 rounded-xl border border-bia-border bg-white px-4 py-3 text-left text-sm text-bia-muted transition-all hover:border-bia-primary/30 hover:bg-bia-surface-2 hover:text-bia-text hover:shadow-sm"
              >
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-bia-primary" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={() => sendMessage(input)}
          onKeyDown={handleKey}
          disabled={isStreaming}
          inputRef={inputRef}
        />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Messages — min-h-0 required for flex-1 scroll area to shrink correctly */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 overscroll-contain">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={() => sendMessage(input)}
        onKeyDown={handleKey}
        disabled={isStreaming}
        inputRef={inputRef}
      />
    </div>
  )
}

const COMPOSER_MAX_HEIGHT = 220

function ChatInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  disabled: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  // Resize textarea without layout thrash: collapse to 0 first so the parent
  // never sees an intermediate expanded state, then grow to clamped scrollHeight.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    const nextHeight = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)
    el.style.height = `${nextHeight}px`
    // Only show scrollbar when content actually exceeds max height
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value, inputRef])

  return (
    <div className="shrink-0 sticky bottom-0 z-20 border-t border-bia-border bg-bia-surface p-4">
      <div className="flex items-end gap-3 rounded-xl border border-bia-border bg-bia-surface-2 px-4 py-3 focus-within:border-bia-primary/50">
        <textarea
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Pergunta sobre o protocolo Banzami, código SDK, invariantes, certificação…"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-sm text-bia-text placeholder-bia-muted-2 outline-none disabled:opacity-50"
          style={{ minHeight: '24px', maxHeight: `${COMPOSER_MAX_HEIGHT}px`, overflowY: 'hidden' }}
        />
        <button
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bia-primary text-white transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M2 8h12M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] text-bia-muted-2">Enter para enviar · Shift+Enter para nova linha</span>
        {!isLiveMode && (
          <span className="text-[10px] text-bia-amber">◯ Demo mode</span>
        )}
      </div>
    </div>
  )
}
