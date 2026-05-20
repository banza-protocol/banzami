'use client'

import { useCallback, useState } from 'react'
import type {
  ValidationItem,
  ValidationCategory,
  ValidationStatus,
  ValidationPriority,
  ValidationDomain,
  ValidationMethod,
  ValidationEvidence,
  EvidenceType,
  GovernanceIssue,
  InvariantStatus,
} from '@/lib/types'
import {
  ALL_STATUSES,
  ALL_PRIORITIES,
  ALL_DOMAINS,
  ALL_METHODS,
  ALL_EVIDENCE_TYPES,
  METHOD_LABELS,
  ALL_INVARIANT_STATUSES,
  INVARIANT_STATUS_LABELS,
  FINANCIAL_CRITICAL_CATEGORIES,
  DOMAIN_LABELS,
  CONFIDENCE_LEVEL_LABELS,
  computeConfidence,
} from '@/lib/types'
import { getRequiresBlockers, getAffectedItems, isFinancialCritical } from '@/lib/governance'

const STATUS_LABELS: Record<ValidationStatus, string> = {
  VALIDATED:             'Validado',
  IMPLEMENTED:           'Implementado',
  IN_PROGRESS:           'Em curso',
  PLANNED:               'Planeado',
  FUTURE:                'Futuro',
  BLOCKED:               'Bloqueado',
  NEEDS_REVIEW:          'Em revisão',
  REVALIDATION_REQUIRED: 'Revalidação necessária',
}

const CONFIDENCE_BADGE_COLORS: Record<string, string> = {
  VERY_HIGH: 'bg-emerald-50 text-emerald-700',
  HIGH:      'bg-blue-50 text-blue-700',
  MEDIUM:    'bg-amber-50 text-amber-700',
  LOW:       'bg-slate-100 text-slate-600',
}

interface Props {
  item: ValidationItem
  categories: ValidationCategory[]
  allItems: ValidationItem[]
  issues: GovernanceIssue[]
  saveError: string | null
  isSaving: boolean
  onChange: (updated: ValidationItem) => void
  onPreviewSave: () => void
  onDiscard: () => void
}

const INVARIANT_STATUS_COLORS: Record<InvariantStatus, { badge: string; dot: string }> = {
  PASS:    { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  FAIL:    { badge: 'bg-red-50 text-red-700',         dot: 'bg-red-500' },
  UNKNOWN: { badge: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400' },
  NOT_RUN: { badge: 'bg-slate-50 text-slate-500',     dot: 'bg-slate-300' },
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-bz-muted">
      {children}
    </label>
  )
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>
}

function inputCls() {
  return 'w-full rounded-md border border-bz-border bg-bz-surface px-3 py-1.5 text-sm text-bz-text outline-none focus:border-bz-primary focus:ring-1 focus:ring-bz-primary/20'
}

export function ItemEditor({
  item,
  categories,
  allItems,
  issues,
  saveError,
  isSaving,
  onChange,
  onPreviewSave,
  onDiscard,
}: Props) {
  const [showHistory, setShowHistory] = useState(false)

  const isFinancial = isFinancialCritical(item.categoryId)
  const requiresBlockers = getRequiresBlockers(item, allItems)
  const isLockedForValidated = item.status === 'VALIDATED' && requiresBlockers.length > 0
  const affectedItems = getAffectedItems(item, allItems)
  const liveConfidence = computeConfidence(item)

  const set = useCallback(
    <K extends keyof ValidationItem>(key: K, value: ValidationItem[K]) => {
      onChange({ ...item, [key]: value })
    },
    [item, onChange],
  )

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  // Evidence helpers
  const addEvidence = () => {
    const ev: ValidationEvidence = { type: 'route', label: '', ref: '' }
    set('evidence', [...item.evidence, ev])
  }
  const updateEvidence = (idx: number, patch: Partial<ValidationEvidence>) => {
    const updated = item.evidence.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    set('evidence', updated)
  }
  const removeEvidence = (idx: number) => {
    set('evidence', item.evidence.filter((_, i) => i !== idx))
  }

  // Blocking issues helpers
  const addBlockingIssue = () => set('blockingIssues', [...item.blockingIssues, ''])
  const updateBlockingIssue = (idx: number, val: string) => {
    set('blockingIssues', item.blockingIssues.map((b, i) => (i === idx ? val : b)))
  }
  const removeBlockingIssue = (idx: number) => {
    set('blockingIssues', item.blockingIssues.filter((_, i) => i !== idx))
  }

  // Acceptance criteria helpers
  const addCriteria = () => set('acceptanceCriteria', [...item.acceptanceCriteria, ''])
  const updateCriteria = (idx: number, val: string) => {
    set('acceptanceCriteria', item.acceptanceCriteria.map((c, i) => (i === idx ? val : c)))
  }
  const removeCriteria = (idx: number) => {
    set('acceptanceCriteria', item.acceptanceCriteria.filter((_, i) => i !== idx))
  }

  // Validation method toggle
  const toggleMethod = (method: ValidationMethod) => {
    const has = item.validationMethods.includes(method)
    set(
      'validationMethods',
      has
        ? item.validationMethods.filter((m) => m !== method)
        : [...item.validationMethods, method],
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Editor header */}
      <div className="flex shrink-0 items-center justify-between border-b border-bz-border px-4 py-3">
        <div>
          <span className="font-mono text-[10px] text-bz-muted">{item.id}</span>
          <p className="mt-0.5 text-sm font-semibold text-bz-text line-clamp-1">{item.title}</p>
        </div>
        <button
          onClick={onDiscard}
          className="ml-3 shrink-0 rounded p-1 text-bz-muted hover:bg-bz-surface hover:text-bz-text"
          title="Descartar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Governance issues */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="shrink-0 border-b border-bz-border bg-bz-surface px-4 py-2 space-y-1">
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

      {/* Scrollable fields */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
        {/* Title */}
        <Field>
          <Label>Título</Label>
          <input
            className={inputCls()}
            value={item.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>

        {/* Status + Priority */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Estado</Label>
            <select
              className={inputCls()}
              value={item.status}
              onChange={(e) => set('status', e.target.value as ValidationStatus)}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Prioridade</Label>
            <select
              className={inputCls()}
              value={item.priority}
              onChange={(e) => set('priority', e.target.value as ValidationPriority)}
            >
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Category + Domain */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Categoria</Label>
            <select
              className={inputCls()}
              value={item.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Domínio</Label>
            <select
              className={inputCls()}
              value={item.validationDomain ?? ''}
              onChange={(e) => set('validationDomain', e.target.value as ValidationDomain)}
            >
              {ALL_DOMAINS.map((d) => (
                <option key={d} value={d}>{d} — {DOMAIN_LABELS[d]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Confidence score (computed, read-only) */}
        <Field>
          <Label>Confidence score</Label>
          <div className="rounded-md border border-bz-border bg-bz-surface p-2.5">
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${CONFIDENCE_BADGE_COLORS[liveConfidence.level] ?? 'bg-slate-100 text-slate-600'}`}>
                {liveConfidence.score} / 100
              </span>
              <span className="text-xs text-bz-muted">{CONFIDENCE_LEVEL_LABELS[liveConfidence.level]}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bz-surface border border-bz-border">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  liveConfidence.score >= 80 ? 'bg-emerald-500'
                  : liveConfidence.score >= 60 ? 'bg-blue-500'
                  : liveConfidence.score >= 40 ? 'bg-amber-500'
                  : 'bg-slate-400'
                }`}
                style={{ width: `${liveConfidence.score}%` }}
              />
            </div>
            <div className="mt-2 space-y-0.5">
              {liveConfidence.basis.map((b, i) => (
                <p key={i} className="font-mono text-[10px] text-bz-muted">+ {b}</p>
              ))}
            </div>
            {item.status === 'VALIDATED' && liveConfidence.score < 80 && (
              <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                ⚠ VALIDATED requer score ≥ 80
              </p>
            )}
          </div>
        </Field>

        {/* Reference section */}
        <Field>
          <Label>Secção de referência</Label>
          <input
            className={inputCls()}
            value={item.referenceSection}
            onChange={(e) => set('referenceSection', e.target.value)}
            placeholder="e.g. §3.1, §7"
          />
        </Field>

        {/* Owner + Technical area */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Área proprietária</Label>
            <input
              className={inputCls()}
              value={item.ownerArea}
              onChange={(e) => set('ownerArea', e.target.value)}
            />
          </div>
          <div>
            <Label>Área técnica</Label>
            <input
              className={inputCls()}
              value={item.technicalArea}
              onChange={(e) => set('technicalArea', e.target.value)}
            />
          </div>
        </div>

        {/* Description */}
        <Field>
          <Label>Descrição</Label>
          <textarea
            className={`${inputCls()} resize-none`}
            rows={3}
            value={item.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        {/* Requirement */}
        <Field>
          <Label>Requisito</Label>
          <textarea
            className={`${inputCls()} resize-none`}
            rows={3}
            value={item.requirement}
            onChange={(e) => set('requirement', e.target.value)}
          />
        </Field>

        {/* Test coverage */}
        <Field>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={item.testCoverage}
              onChange={(e) => set('testCoverage', e.target.checked)}
              className="accent-bz-primary"
            />
            <span className="text-sm text-bz-text">Tem cobertura de testes</span>
          </label>
        </Field>

        {/* Validation methods */}
        <Field>
          <Label>Métodos de validação</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_METHODS.map((m) => {
              const active = item.validationMethods.includes(m)
              return (
                <button
                  key={m}
                  onClick={() => toggleMethod(m)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-bz-primary text-white'
                      : 'border border-bz-border text-bz-muted hover:border-bz-primary hover:text-bz-primary'
                  }`}
                >
                  {METHOD_LABELS[m]}
                </button>
              )
            })}
          </div>
        </Field>

        {/* Acceptance criteria */}
        <Field>
          <div className="mb-1 flex items-center justify-between">
            <Label>Critérios de aceitação</Label>
            <button
              onClick={addCriteria}
              className="text-[11px] text-bz-primary hover:underline"
            >
              + Adicionar
            </button>
          </div>
          <div className="space-y-1.5">
            {item.acceptanceCriteria.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className={inputCls()}
                  value={c}
                  onChange={(e) => updateCriteria(i, e.target.value)}
                  placeholder={`Critério ${i + 1}`}
                />
                <button
                  onClick={() => removeCriteria(i)}
                  className="shrink-0 text-bz-muted hover:text-red-600"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </Field>

        {/* Evidence */}
        <Field>
          <div className="mb-1 flex items-center justify-between">
            <Label>Evidências</Label>
            <button
              onClick={addEvidence}
              className="text-[11px] text-bz-primary hover:underline"
            >
              + Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {item.evidence.map((ev, i) => (
              <div key={i} className="rounded-md border border-bz-border bg-bz-surface p-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <select
                    value={ev.type}
                    onChange={(e) => updateEvidence(i, { type: e.target.value as EvidenceType })}
                    className="rounded border border-bz-border bg-white px-2 py-1 text-xs outline-none focus:border-bz-primary"
                  >
                    {ALL_EVIDENCE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeEvidence(i)}
                    className="ml-auto text-bz-muted hover:text-red-600"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-1">
                  <input
                    className="w-full rounded border border-bz-border bg-white px-2 py-1 text-xs outline-none focus:border-bz-primary"
                    value={ev.label}
                    onChange={(e) => updateEvidence(i, { label: e.target.value })}
                    placeholder="Label"
                  />
                  <input
                    className="w-full rounded border border-bz-border bg-white px-2 py-1 font-mono text-xs outline-none focus:border-bz-primary"
                    value={ev.ref}
                    onChange={(e) => updateEvidence(i, { ref: e.target.value })}
                    placeholder="Referência / caminho"
                  />
                </div>
              </div>
            ))}
            {item.evidence.length === 0 && (
              <p className="text-xs text-bz-muted">Nenhuma evidência registada.</p>
            )}
          </div>
        </Field>

        {/* Blocking issues */}
        <Field>
          <div className="mb-1 flex items-center justify-between">
            <Label>Bloqueios</Label>
            <button
              onClick={addBlockingIssue}
              className="text-[11px] text-bz-primary hover:underline"
            >
              + Adicionar
            </button>
          </div>
          <div className="space-y-1.5">
            {item.blockingIssues.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <textarea
                  className={`${inputCls()} resize-none`}
                  rows={2}
                  value={b}
                  onChange={(e) => updateBlockingIssue(i, e.target.value)}
                  placeholder={`Bloqueio ${i + 1}`}
                />
                <button
                  onClick={() => removeBlockingIssue(i)}
                  className="shrink-0 self-start pt-1.5 text-bz-muted hover:text-red-600"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            {item.blockingIssues.length === 0 && (
              <p className="text-xs text-bz-muted">Nenhum bloqueio registado.</p>
            )}
          </div>
        </Field>

        {/* Architecture lock — requires */}
        {(item.requires ?? []).length > 0 && (
          <Field>
            <Label>Requer (VALIDATED)</Label>
            <div className="space-y-1">
              {(item.requires ?? []).map((reqId) => {
                const dep = allItems.find((i) => i.id === reqId)
                const isValidated = dep?.status === 'VALIDATED'
                return (
                  <div
                    key={reqId}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                      isValidated
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isValidated ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="font-mono font-semibold">{reqId}</span>
                    {dep && (
                      <span className="truncate text-[10px] opacity-70">{dep.title}</span>
                    )}
                    <span className="ml-auto shrink-0 font-semibold">
                      {dep?.status ?? 'NÃO ENCONTRADO'}
                    </span>
                    {!isValidated && (
                      <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1a4 4 0 014 4v1.5h1a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-7a1 1 0 011-1h1V5a4 4 0 014-4zm0 9a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-7a2 2 0 00-2 2v1.5h4V5a2 2 0 00-2-2z" />
                      </svg>
                    )}
                  </div>
                )
              })}
              {isLockedForValidated && (
                <p className="mt-1 text-[10px] text-red-600">
                  ⚠ VALIDATED bloqueado até todas as dependências serem validadas
                </p>
              )}
            </div>
          </Field>
        )}

        {/* Financial invariants */}
        {isFinancial && (
          <Field>
            <div className="mb-1 flex items-center gap-2">
              <Label>Invariantes financeiros</Label>
              <span className="rounded bg-bz-primary-light px-1.5 py-0.5 text-[10px] font-bold text-bz-primary">
                CRÍTICO
              </span>
            </div>
            {(item.invariants ?? []).length === 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Nenhum invariante definido — obrigatório para VALIDATED em categorias financeiras
              </div>
            ) : (
              <div className="space-y-2">
                {(item.invariants ?? []).map((inv, i) => {
                  const sc = INVARIANT_STATUS_COLORS[inv.status]
                  return (
                    <div key={inv.id} className="rounded-md border border-bz-border bg-bz-surface p-2.5">
                      <div className="flex items-start gap-2">
                        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${sc.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-bz-muted">{inv.id}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${sc.badge}`}>
                              {INVARIANT_STATUS_LABELS[inv.status]}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-bz-text">{inv.name}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-bz-muted">{inv.rule}</p>
                          <div className="mt-1.5">
                            <select
                              value={inv.status}
                              onChange={(e) => {
                                const updated = (item.invariants ?? []).map((iv, idx) =>
                                  idx === i ? { ...iv, status: e.target.value as InvariantStatus, lastChecked: new Date().toISOString().split('T')[0] } : iv
                                )
                                set('invariants', updated)
                              }}
                              className="rounded border border-bz-border bg-white px-2 py-0.5 text-[11px] outline-none focus:border-bz-primary"
                            >
                              {ALL_INVARIANT_STATUSES.map((s) => (
                                <option key={s} value={s}>{INVARIANT_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Field>
        )}

        {/* Freeze reason — shown when REVALIDATION_REQUIRED */}
        {item.status === 'REVALIDATION_REQUIRED' && (
          <Field>
            <Label>Motivo da revalidação</Label>
            <textarea
              className={`${inputCls()} resize-none border-orange-300 focus:border-orange-500`}
              rows={2}
              value={item.freezeReason ?? ''}
              onChange={(e) => set('freezeReason', e.target.value || undefined)}
              placeholder="Descrever o que mudou e porquê a revalidação é necessária…"
            />
          </Field>
        )}

        {/* Affects — downstream items */}
        {affectedItems.length > 0 && (
          <Field>
            <Label>Afecta (dependentes)</Label>
            <div className="space-y-1">
              {affectedItems.map((dep) => (
                <div
                  key={dep.id}
                  className="flex items-center gap-2 rounded-md bg-bz-surface px-2.5 py-1.5 text-xs text-bz-muted"
                >
                  <span className="font-mono font-semibold text-bz-text">{dep.id}</span>
                  <span className="truncate">{dep.title}</span>
                  <span className="ml-auto shrink-0 font-mono">{dep.status}</span>
                </div>
              ))}
              <p className="text-[10px] text-bz-muted">
                Estes itens podem necessitar revalidação se este item for alterado.
              </p>
            </div>
          </Field>
        )}

        {/* Revalidate when changed — file patterns */}
        {(item.revalidateWhenChanged ?? []).length > 0 && (
          <Field>
            <Label>Revalidar quando</Label>
            <div className="flex flex-wrap gap-1">
              {(item.revalidateWhenChanged ?? []).map((pattern, i) => (
                <span key={i} className="rounded bg-bz-surface border border-bz-border px-2 py-0.5 font-mono text-[10px] text-bz-muted">
                  {pattern}
                </span>
              ))}
            </div>
          </Field>
        )}

        {/* Dependencies (informational) */}
        <Field>
          <Label>Dependências (informativo)</Label>
          <p className="text-xs text-bz-muted">
            {item.dependencies.length > 0 ? item.dependencies.join(', ') : 'Nenhuma'}
          </p>
        </Field>

        {/* Notes */}
        <Field>
          <Label>Notas internas</Label>
          <textarea
            className={`${inputCls()} resize-none`}
            rows={3}
            value={item.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || undefined)}
            placeholder="Notas opcionais…"
          />
        </Field>

        {/* Immutable history */}
        {(item.history ?? []).length > 0 && (
          <Field>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-bz-muted"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showHistory ? 'rotate-90' : ''}`}
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Histórico de validação ({(item.history ?? []).length})
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {[...(item.history ?? [])].reverse().map((entry, i) => (
                  <div key={i} className="rounded-md border border-bz-border bg-bz-surface p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-bz-muted">
                        {entry.timestamp.replace('T', ' ').slice(0, 16)}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                        {entry.from ?? '—'} → {entry.to}
                      </span>
                      <span className="font-mono text-[10px] text-bz-muted" title="Fingerprint">
                        #{entry.fingerprint.slice(0, 8)}
                      </span>
                    </div>
                    <p className="mt-1 text-bz-text">{entry.reason}</p>
                    {entry.commit && (
                      <p className="mt-0.5 font-mono text-[10px] text-bz-muted">
                        commit {entry.commit}
                      </p>
                    )}
                    {entry.evidence.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {entry.evidence.map((ev, j) => (
                          <span key={j} className="rounded bg-bz-surface border border-bz-border px-1.5 py-0.5 font-mono text-[10px]">
                            {ev}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Field>
        )}

        {/* Last updated (read-only) */}
        <div className="mb-4 text-[11px] text-bz-muted">
          Última actualização: <span className="font-mono">{item.lastUpdated}</span>
        </div>

        {/* Save error */}
        {saveError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {saveError}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-bz-border bg-white px-4 py-3">
        <button
          onClick={onDiscard}
          className="rounded-md border border-bz-border px-3 py-1.5 text-sm text-bz-muted hover:bg-bz-surface"
        >
          Descartar
        </button>
        <button
          onClick={onPreviewSave}
          disabled={isSaving || errors.length > 0}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
            isSaving || errors.length > 0
              ? 'cursor-not-allowed bg-bz-surface text-bz-muted'
              : 'bg-bz-primary text-white hover:bg-bz-primary-hover'
          }`}
        >
          {errors.length > 0 ? `${errors.length} erro${errors.length > 1 ? 's' : ''}` : 'Pré-visualizar e guardar'}
        </button>
      </div>
    </div>
  )
}
