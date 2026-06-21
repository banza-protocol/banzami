'use client'

import { useState, useMemo, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type {
  ValidationMatrix,
  ValidationItem,
  ValidationStatus,
  ValidationPriority,
  ValidationDomain,
  ConfidenceLevel,
  GovernanceIssue,
  ItemChange,
} from '@/lib/types'
import { checkItem, checkRequires, hasErrors } from '@/lib/governance'
import { saveMatrix, previewSave } from '@/actions/matrix'
import { getGitContext, getMatrixDiff } from '@/actions/git'
import { ItemList } from './ItemList'
import { ItemEditor } from './ItemEditor'
import { DiffModal } from './DiffModal'
import { CommitModal } from './CommitModal'

interface Props {
  initialMatrix: ValidationMatrix
  gitBranch: string
  gitStatus: string
}

export function Studio({ initialMatrix, gitBranch, gitStatus: initialGitStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Working matrix — all unsaved edits live here
  const [matrix, setMatrix] = useState<ValidationMatrix>(initialMatrix)
  // Original on-disk state — used for diff computation
  const [savedMatrix, setSavedMatrix] = useState<ValidationMatrix>(initialMatrix)

  // Editor state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editedItem, setEditedItem] = useState<ValidationItem | null>(null)
  const [itemIssues, setItemIssues] = useState<GovernanceIssue[]>([])

  // Filter state
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ValidationStatus | null>(null)
  const [filterPriority, setFilterPriority] = useState<ValidationPriority | null>(null)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterDomain, setFilterDomain] = useState<ValidationDomain | null>(null)
  const [filterConfidence, setFilterConfidence] = useState<ConfidenceLevel | null>(null)
  const [filterMissingEvidence, setFilterMissingEvidence] = useState(false)
  const [filterRevalidation, setFilterRevalidation] = useState(false)

  // Modal state
  const [showDiff, setShowDiff] = useState(false)
  const [showCommit, setShowCommit] = useState(false)
  const [diffChanges, setDiffChanges] = useState<ItemChange[]>([])
  const [diffIssues, setDiffIssues] = useState<GovernanceIssue[]>([])
  const [diffFingerprint, setDiffFingerprint] = useState<string | undefined>(undefined)
  const [gitDiff, setGitDiff] = useState('')
  const [gitLog, setGitLog] = useState('')
  const [gitBranchState, setGitBranchState] = useState(gitBranch)
  const [gitStatusState, setGitStatusState] = useState(initialGitStatus)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Computed: is there an unsaved edited item?
  const isDirty = editedItem !== null

  // Computed: items with unsaved local changes applied
  const liveMatrix = useMemo((): ValidationMatrix => {
    if (!editedItem) return matrix
    return {
      ...matrix,
      items: matrix.items.map((item) =>
        item.id === editedItem.id ? editedItem : item,
      ),
    }
  }, [matrix, editedItem])

  // Filtered item list
  const filteredItems = useMemo(() => {
    return liveMatrix.items.filter((item) => {
      if (filterCategory && item.categoryId !== filterCategory) return false
      if (filterStatus && item.status !== filterStatus) return false
      if (filterPriority && item.priority !== filterPriority) return false
      if (filterDomain && item.validationDomain !== filterDomain) return false
      if (filterConfidence && item.confidence?.level !== filterConfidence) return false
      if (filterMissingEvidence && item.evidence.length > 0) return false
      if (filterRevalidation && item.status !== 'REVALIDATION_REQUIRED') return false
      if (search) {
        const q = search.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.ownerArea.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [liveMatrix, filterCategory, filterStatus, filterPriority, filterDomain, filterConfidence, filterMissingEvidence, filterRevalidation, search])

  // Category metrics for sidebar
  const categoryMetrics = useMemo(() => {
    return liveMatrix.categories.map((cat) => {
      const items = liveMatrix.items.filter((i) => i.categoryId === cat.id)
      const done = items.filter((i) => ['VALIDATED', 'IMPLEMENTED'].includes(i.status)).length
      return { ...cat, total: items.length, done }
    })
  }, [liveMatrix])

  // Global metrics
  const metrics = useMemo(() => {
    const items = liveMatrix.items
    return {
      total: items.length,
      // Roadmap = tracked future scope (FUTURE | PLANNED), e.g. the BANZA L1–L4
      // progression. Excluded from completion % so future scope does not read as
      // "incomplete launch work".
      roadmap: items.filter((i) => i.status === 'FUTURE' || i.status === 'PLANNED').length,
      validated: items.filter((i) => i.status === 'VALIDATED').length,
      implemented: items.filter((i) => i.status === 'IMPLEMENTED').length,
      inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
      blocked: items.filter((i) => i.status === 'BLOCKED').length,
      revalidationRequired: items.filter((i) => i.status === 'REVALIDATION_REQUIRED').length,
      missingEvidence: items.filter(
        (i) => ['VALIDATED', 'IMPLEMENTED'].includes(i.status) && i.evidence.length === 0,
      ).length,
      lowConfidence: items.filter(
        (i) => ['VALIDATED', 'IMPLEMENTED'].includes(i.status) && (i.confidence?.score ?? 0) < 60,
      ).length,
    }
  }, [liveMatrix])

  const donePct =
    metrics.total - metrics.roadmap > 0
      ? Math.round(((metrics.validated + metrics.implemented) / (metrics.total - metrics.roadmap)) * 100)
      : 0

  // Select an item to edit
  const handleSelect = useCallback(
    (id: string) => {
      if (isDirty && selectedId !== id) {
        if (!confirm('Tens alterações não guardadas. Descartá-las?')) return
      }
      const item = matrix.items.find((i) => i.id === id)
      if (!item) return
      setSelectedId(id)
      setEditedItem(structuredClone(item))
      setItemIssues([...checkItem(item), ...checkRequires(item, matrix.items)])
      setSaveError(null)
    },
    [isDirty, selectedId, matrix.items],
  )

  const handleItemChange = useCallback(
    (updated: ValidationItem) => {
      setEditedItem(updated)
      setItemIssues([...checkItem(updated), ...checkRequires(updated, liveMatrix.items)])
    },
    [liveMatrix.items],
  )

  const handleDiscard = useCallback(() => {
    setSelectedId(null)
    setEditedItem(null)
    setItemIssues([])
    setSaveError(null)
  }, [])

  // Preview save — show diff modal
  const handlePreviewSave = useCallback(async () => {
    if (!editedItem) return
    const updatedMatrix: ValidationMatrix = {
      ...matrix,
      items: matrix.items.map((i) => (i.id === editedItem.id ? editedItem : i)),
    }
    const { issues, changes, fingerprint } = await previewSave(savedMatrix, updatedMatrix)
    setDiffChanges(changes)
    setDiffIssues(issues)
    setDiffFingerprint(fingerprint)
    setShowDiff(true)
  }, [editedItem, matrix, savedMatrix])

  // Confirm save
  const handleConfirmSave = useCallback(async () => {
    if (!editedItem) return
    setIsSaving(true)
    setSaveError(null)

    const updatedMatrix: ValidationMatrix = {
      ...matrix,
      items: matrix.items.map((i) => (i.id === editedItem.id ? editedItem : i)),
    }

    const result = await saveMatrix(savedMatrix, updatedMatrix)

    if (!result.ok) {
      setSaveError(result.errors.map((e) => e.message).join(' · '))
      setIsSaving(false)
      return
    }

    // Committed to disk — update both working and saved state
    const freshMatrix: ValidationMatrix = {
      ...updatedMatrix,
      meta: { ...updatedMatrix.meta },
    }
    setMatrix(freshMatrix)
    setSavedMatrix(freshMatrix)
    setEditedItem(null)
    setSelectedId(null)
    setItemIssues([])
    setShowDiff(false)
    setIsSaving(false)
  }, [editedItem, matrix, savedMatrix])

  // Open commit modal — refresh git state first
  const handleOpenCommit = useCallback(async () => {
    const [ctx, diff] = await Promise.all([getGitContext(), getMatrixDiff()])
    setGitBranchState(ctx.branch)
    setGitStatusState(ctx.status)
    setGitDiff(diff)
    setGitLog(ctx.log)
    setShowCommit(true)
  }, [])

  const handleCommitDone = useCallback(() => {
    setShowCommit(false)
    startTransition(() => router.refresh())
  }, [router])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-bz-border bg-white px-4">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bz-primary">
            <span className="text-xs font-bold text-white">B</span>
          </div>
          <div>
            <span className="text-sm font-bold text-bz-text">Validation Studio</span>
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">LOCAL ONLY</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-bz-muted">
          {/* Branch */}
          <span className="flex items-center gap-1.5 rounded-md border border-bz-border bg-bz-surface px-2 py-1 font-mono">
            <span className="text-bz-primary">⎇</span> {gitBranchState}
          </span>
          {/* Git status indicator */}
          {gitStatusState.trim() && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
              ● alterações não commitadas
            </span>
          )}
          {/* Stats */}
          <span>{donePct}% completo</span>
          <span className="text-bz-border">·</span>
          <span>{metrics.total} itens</span>
          {metrics.roadmap > 0 && (
            <>
              <span className="text-bz-border">·</span>
              <span className="text-gray-500">{metrics.roadmap} roadmap</span>
            </>
          )}
          {metrics.revalidationRequired > 0 && (
            <>
              <span className="text-bz-border">·</span>
              <span className="font-semibold text-orange-600">{metrics.revalidationRequired} revalidação</span>
            </>
          )}
          {metrics.blocked > 0 && (
            <>
              <span className="text-bz-border">·</span>
              <span className="text-red-600">{metrics.blocked} bloqueados</span>
            </>
          )}
          {metrics.missingEvidence > 0 && (
            <>
              <span className="text-bz-border">·</span>
              <span className="text-amber-600">{metrics.missingEvidence} sem evidência</span>
            </>
          )}
          {/* Commit button */}
          <button
            onClick={handleOpenCommit}
            className="rounded-md bg-bz-primary px-3 py-1 text-xs font-semibold text-white hover:bg-bz-primary-hover transition-colors"
          >
            Git Commit
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — categories + filters */}
        <aside className="scrollbar-thin flex w-56 shrink-0 flex-col overflow-y-auto border-r border-bz-border bg-white py-4">
          {/* Progress */}
          <div className="mb-4 px-4">
            <div className="mb-1 flex items-center justify-between text-[10px] text-bz-muted">
              <span className="font-semibold uppercase tracking-wider">Progresso global</span>
              <span className="font-bold text-bz-text">{donePct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bz-surface">
              <div
                className="h-full rounded-full bg-bz-primary transition-all duration-300"
                style={{ width: `${donePct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-bz-muted">
              {metrics.validated + metrics.implemented} de {metrics.total} completas
            </p>
          </div>

          <div className="mb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-bz-muted">
            Categorias
          </div>

          {/* All categories option */}
          <button
            onClick={() => setFilterCategory(null)}
            className={`flex items-center justify-between px-4 py-1.5 text-sm transition-colors ${
              filterCategory === null
                ? 'bg-bz-primary-light font-semibold text-bz-primary'
                : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
            }`}
          >
            <span>Todas</span>
            <span className="rounded-full bg-bz-surface px-1.5 py-0.5 font-mono text-[10px]">
              {metrics.total}
            </span>
          </button>

          {categoryMetrics.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`flex items-center justify-between px-4 py-1.5 text-left text-sm transition-colors ${
                filterCategory === cat.id
                  ? 'bg-bz-primary-light font-semibold text-bz-primary'
                  : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
              }`}
            >
              <span className="truncate">{cat.name}</span>
              <span className="ml-1 shrink-0 rounded-full bg-bz-surface px-1.5 py-0.5 font-mono text-[10px]">
                {cat.total}
              </span>
            </button>
          ))}

          {/* Quick filters */}
          <div className="mt-4 border-t border-bz-border px-4 pt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-bz-muted">
              Filtros rápidos
            </div>
            {metrics.revalidationRequired > 0 && (
              <button
                onClick={() => setFilterRevalidation((v) => !v)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  filterRevalidation
                    ? 'bg-orange-50 font-semibold text-orange-700'
                    : 'text-bz-muted hover:bg-bz-surface'
                }`}
              >
                ↻ Revalidação ({metrics.revalidationRequired})
              </button>
            )}
            <button
              onClick={() => setFilterMissingEvidence((v) => !v)}
              className={`mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                filterMissingEvidence
                  ? 'bg-amber-50 font-semibold text-amber-700'
                  : 'text-bz-muted hover:bg-bz-surface'
              }`}
            >
              ⚠ Sem evidência ({metrics.missingEvidence})
            </button>
            <button
              onClick={() => setFilterStatus(filterStatus === 'BLOCKED' ? null : 'BLOCKED')}
              className={`mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                filterStatus === 'BLOCKED'
                  ? 'bg-red-50 font-semibold text-red-700'
                  : 'text-bz-muted hover:bg-bz-surface'
              }`}
            >
              ✕ Bloqueadas ({metrics.blocked})
            </button>
            {metrics.lowConfidence > 0 && (
              <button
                onClick={() => setFilterConfidence(filterConfidence === 'LOW' ? null : 'LOW')}
                className={`mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  filterConfidence === 'LOW'
                    ? 'bg-slate-100 font-semibold text-slate-700'
                    : 'text-bz-muted hover:bg-bz-surface'
                }`}
              >
                ↓ Confiança baixa ({metrics.lowConfidence})
              </button>
            )}
          </div>
        </aside>

        {/* Main list area */}
        <div
          className={`flex min-w-0 flex-col overflow-hidden transition-all duration-200 ${
            selectedId ? 'w-[calc(100%-480px)]' : 'flex-1'
          }`}
        >
          <ItemList
            items={filteredItems}
            allItems={liveMatrix.items}
            selectedId={selectedId}
            search={search}
            filterStatus={filterStatus}
            filterPriority={filterPriority}
            filterDomain={filterDomain}
            filterConfidence={filterConfidence}
            onSearchChange={setSearch}
            onStatusChange={setFilterStatus}
            onPriorityChange={setFilterPriority}
            onDomainChange={setFilterDomain}
            onConfidenceChange={setFilterConfidence}
            onSelect={handleSelect}
          />
        </div>

        {/* Right editor panel */}
        {selectedId && editedItem && (
          <div className="flex w-[480px] shrink-0 flex-col overflow-hidden border-l border-bz-border bg-white">
            <ItemEditor
              item={editedItem}
              categories={matrix.categories}
              allItems={liveMatrix.items}
              issues={itemIssues}
              saveError={saveError}
              isSaving={isSaving}
              onChange={handleItemChange}
              onPreviewSave={handlePreviewSave}
              onDiscard={handleDiscard}
            />
          </div>
        )}
      </div>

      {/* Diff / Save modal */}
      {showDiff && (
        <DiffModal
          changes={diffChanges}
          issues={diffIssues}
          fingerprint={diffFingerprint}
          isSaving={isSaving}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowDiff(false)}
        />
      )}

      {/* Commit modal */}
      {showCommit && (
        <CommitModal
          branch={gitBranchState}
          gitDiff={gitDiff}
          gitLog={gitLog}
          onDone={handleCommitDone}
          onCancel={() => setShowCommit(false)}
        />
      )}
    </div>
  )
}
