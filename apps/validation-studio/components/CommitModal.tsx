'use client'

import { useState, useMemo } from 'react'
import { commitMatrix } from '@/actions/git'

interface Props {
  branch: string
  gitDiff: string
  gitLog: string
  onDone: () => void
  onCancel: () => void
}

// Extract item IDs (e.g. QR-001, KYC-003) from changed lines in the diff.
function parseChangedIds(diff: string): string[] {
  const ids = new Set<string>()
  const pattern = /\b([A-Z]+-\d+)\b/g
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    let m: RegExpExecArray | null
    while ((m = pattern.exec(line)) !== null) ids.add(m[1])
  }
  return [...ids].sort()
}

// Build a suggested commit prefix based on detected item IDs.
function suggestPrefix(ids: string[]): string {
  if (ids.length === 0) return 'validation(matrix): '
  if (ids.length === 1) return `validation(${ids[0]}): `
  if (ids.length <= 3) return `validation(${ids.join(',')}): `
  return 'validation(matrix): '
}

// Parse git log --oneline output into structured entries.
function parseLog(log: string): { hash: string; msg: string }[] {
  return log
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const space = l.indexOf(' ')
      return { hash: l.slice(0, space), msg: l.slice(space + 1) }
    })
}

export function CommitModal({ branch, gitDiff, gitLog, onDone, onCancel }: Props) {
  const hasDiff = gitDiff.trim().length > 0

  const changedIds = useMemo(() => parseChangedIds(gitDiff), [gitDiff])
  const suggestedPrefix = useMemo(() => suggestPrefix(changedIds), [changedIds])
  const recentLog = useMemo(() => parseLog(gitLog), [gitLog])

  const [message, setMessage] = useState(suggestedPrefix)
  const [isCommitting, setIsCommitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null)
  const [showDiff, setShowDiff] = useState(false)

  const isValidMessage = message.trim().length > suggestedPrefix.trim().length || (
    // Allow if user has typed something beyond just the prefix
    message.trim().length > 0 && message.trim() !== suggestedPrefix.trim()
  )

  const handleCommit = async () => {
    if (!isValidMessage || !hasDiff) return
    setIsCommitting(true)
    const res = await commitMatrix(message.trim())
    setResult(res)
    setIsCommitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-bz-border bg-white shadow-xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-bz-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-bz-text">Git Commit</h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-bz-muted">
              <span className="text-bz-primary">⎇</span>
              <span className="font-mono">{branch}</span>
              {hasDiff ? (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  ● alterações não commitadas
                </span>
              ) : (
                <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  sem alterações
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-bz-muted hover:bg-bz-surface hover:text-bz-text"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Post-commit result ── */}
          {result && (
            <div
              className={`rounded-lg border p-4 ${
                result.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <p className={`mb-2 text-xs font-bold ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {result.ok ? '✓ Commit criado com sucesso' : '✕ Erro ao criar commit'}
              </p>
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-bz-text opacity-80">
                {result.output}
              </pre>

              {result.ok && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Próximo passo — Git push
                  </p>
                  <div className="flex items-center gap-2 rounded bg-amber-100 px-2.5 py-1.5 font-mono text-xs text-amber-900">
                    git push origin {branch}
                  </div>
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    Sem push, o commit existe apenas localmente. Execute o comando acima para publicar.
                  </p>
                </div>
              )}

              <div className="mt-3">
                <button
                  onClick={onDone}
                  className="rounded-md bg-bz-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-bz-primary-hover"
                >
                  Fechar e actualizar
                </button>
              </div>
            </div>
          )}

          {!result && (
            <>
              {/* ── Changed items ── */}
              {hasDiff && changedIds.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-bz-muted">
                    Itens afectados
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {changedIds.map((id) => (
                      <span
                        key={id}
                        className="rounded bg-bz-primary-light px-2 py-0.5 font-mono text-[11px] font-semibold text-bz-primary"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── No diff state ── */}
              {!hasDiff && (
                <div className="rounded-lg border border-bz-border bg-bz-surface px-4 py-6 text-center text-sm text-bz-muted">
                  Nenhuma alteração pendente no ficheiro da matriz
                </div>
              )}

              {/* ── Commit message ── */}
              {hasDiff && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-bz-muted">
                    Mensagem de commit
                  </label>
                  <textarea
                    className="w-full rounded-md border border-bz-border bg-bz-surface px-3 py-2 font-mono text-sm text-bz-text outline-none focus:border-bz-primary focus:ring-1 focus:ring-bz-primary/20"
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isCommitting}
                    spellCheck={false}
                    autoFocus
                  />
                  <div className="mt-1.5 space-y-1">
                    <p className="text-[10px] text-bz-muted">
                      Formato: <span className="font-mono text-bz-text">validation(ID): descrição da alteração</span>
                    </p>
                    <div className="flex flex-col gap-0.5 font-mono text-[10px] text-bz-muted">
                      <span>↳ validation(QR-001): validate merchant static QR</span>
                      <span>↳ validation(KYC-001): move onboarding to in_progress</span>
                      <span>↳ validation(matrix): update evidence for SEC and API domains</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Diff preview ── */}
              {hasDiff && (
                <div>
                  <button
                    onClick={() => setShowDiff((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-bz-primary hover:underline"
                  >
                    <svg
                      className={`h-3.5 w-3.5 transition-transform ${showDiff ? 'rotate-90' : ''}`}
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {showDiff ? 'Ocultar diff' : 'Ver diff completo'}
                  </button>
                  {showDiff && (
                    <pre className="scrollbar-thin mt-2 max-h-64 overflow-auto rounded-lg border border-bz-border bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre">
                      {gitDiff}
                    </pre>
                  )}
                </div>
              )}

              {/* ── Recent git history ── */}
              {recentLog.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-bz-muted">
                    Histórico recente
                  </p>
                  <div className="divide-y divide-bz-border rounded-lg border border-bz-border overflow-hidden">
                    {recentLog.map((entry) => (
                      <div key={entry.hash} className="flex items-center gap-3 bg-bz-surface px-3 py-2">
                        <span className="shrink-0 font-mono text-[10px] text-bz-muted">{entry.hash}</span>
                        <span className="truncate text-xs text-bz-text">{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-bz-border bg-white px-5 py-3">
            <button
              onClick={onCancel}
              className="rounded-md border border-bz-border px-3 py-1.5 text-sm text-bz-muted hover:bg-bz-surface"
            >
              Cancelar
            </button>
            <button
              onClick={handleCommit}
              disabled={!isValidMessage || isCommitting || !hasDiff}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                !isValidMessage || isCommitting || !hasDiff
                  ? 'cursor-not-allowed bg-bz-surface text-bz-muted'
                  : 'bg-bz-primary text-white hover:bg-bz-primary-hover'
              }`}
            >
              {isCommitting ? 'A commitar…' : !hasDiff ? 'Sem alterações' : 'Criar commit →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
