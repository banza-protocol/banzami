'use client'

import type { ItemChange, GovernanceIssue } from '@/lib/types'

interface Props {
  changes: ItemChange[]
  issues: GovernanceIssue[]
  fingerprint?: string
  isSaving: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DiffModal({ changes, issues, fingerprint, isSaving, onConfirm, onCancel }: Props) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const hasChanges = changes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-bz-border bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-bz-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-bz-text">Pré-visualização das alterações</h2>
            <p className="mt-0.5 text-xs text-bz-muted">Reveja as alterações antes de guardar em disco</p>
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
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Governance issues */}
          {(errors.length > 0 || warnings.length > 0) && (
            <div className="rounded-lg border border-bz-border bg-bz-surface p-3 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-bz-muted">
                Verificação de governança
              </p>
              {errors.map((issue, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                  <span className="mt-0.5 shrink-0 font-bold">✕</span>
                  <span>{issue.message}</span>
                </div>
              ))}
              {warnings.map((issue, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <span className="mt-0.5 shrink-0 font-bold">⚠</span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Fingerprint */}
        {fingerprint && (
          <div className="flex items-center gap-2 rounded-lg border border-bz-border bg-bz-surface px-3 py-2">
            <svg className="h-3.5 w-3.5 shrink-0 text-bz-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1a3 3 0 013 3M8 1a3 3 0 00-3 3M5 4v.5M11 4v.5M2 7.5h12M3 7.5v5.5a2 2 0 002 2h6a2 2 0 002-2V7.5" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-bz-muted">Fingerprint</span>
            <code className="ml-auto font-mono text-[11px] text-bz-text">{fingerprint}</code>
          </div>
        )}

        {/* Changes */}
          {!hasChanges ? (
            <div className="rounded-lg border border-bz-border bg-bz-surface px-4 py-6 text-center text-sm text-bz-muted">
              Nenhuma alteração detectada
            </div>
          ) : (
            changes.map((change) => (
              <div key={change.itemId} className="rounded-lg border border-bz-border overflow-hidden">
                <div className="border-b border-bz-border bg-bz-surface px-3 py-2">
                  <span className="font-mono text-[10px] text-bz-muted">{change.itemId}</span>
                  <p className="text-sm font-semibold text-bz-text">{change.title}</p>
                </div>
                <div className="divide-y divide-bz-border">
                  {change.changes.map((fc, i) => (
                    <div key={i} className="px-3 py-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-bz-muted">
                        {fc.field}
                      </p>
                      <div className="flex gap-2">
                        <div className="flex-1 rounded bg-red-50 px-2 py-1">
                          <span className="mr-1 text-[10px] font-bold text-red-400">−</span>
                          <span className="text-xs text-red-700 break-all">{fc.from || '(vazio)'}</span>
                        </div>
                        <div className="flex-1 rounded bg-emerald-50 px-2 py-1">
                          <span className="mr-1 text-[10px] font-bold text-emerald-500">+</span>
                          <span className="text-xs text-emerald-700 break-all">{fc.to || '(vazio)'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-bz-border px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-bz-border px-3 py-1.5 text-sm text-bz-muted hover:bg-bz-surface"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving || errors.length > 0 || !hasChanges}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              isSaving || errors.length > 0 || !hasChanges
                ? 'cursor-not-allowed bg-bz-surface text-bz-muted'
                : 'bg-bz-primary text-white hover:bg-bz-primary-hover'
            }`}
          >
            {isSaving
              ? 'A guardar…'
              : errors.length > 0
                ? 'Corrigir erros primeiro'
                : !hasChanges
                  ? 'Sem alterações'
                  : 'Guardar em disco'}
          </button>
        </div>
      </div>
    </div>
  )
}
