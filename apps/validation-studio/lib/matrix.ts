import fs from 'fs'
import path from 'path'
import type {
  ValidationMatrix,
  ValidationItem,
  ValidationHistory,
  ItemChange,
  FieldChange,
} from './types'

// apps/validation-studio/ → ../../docs/validation/
export const MATRIX_PATH = path.join(
  process.cwd(),
  '../../docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json',
)

// Relative from repo root — used in git commands
export const MATRIX_REPO_PATH = 'docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json'

export function readMatrix(): ValidationMatrix {
  const raw = fs.readFileSync(MATRIX_PATH, 'utf-8')
  return JSON.parse(raw) as ValidationMatrix
}

export function writeMatrix(matrix: ValidationMatrix): void {
  const json = JSON.stringify(matrix, null, 2)
  fs.writeFileSync(MATRIX_PATH, json + '\n', 'utf-8')
}

/**
 * Append an immutable history entry to an item.
 * Returns a new item — never mutates in place.
 * History is append-only: existing entries are never modified.
 */
export function appendHistory(
  item: ValidationItem,
  entry: Omit<ValidationHistory, 'timestamp'>,
): ValidationItem {
  const historyEntry: ValidationHistory = {
    timestamp: new Date().toISOString(),
    ...entry,
  }
  return {
    ...item,
    history: [...(item.history ?? []), historyEntry],
  }
}

export function computeChangeSummary(
  original: ValidationMatrix,
  updated: ValidationMatrix,
): ItemChange[] {
  const changes: ItemChange[] = []

  for (const updatedItem of updated.items) {
    const orig = original.items.find((i) => i.id === updatedItem.id)
    if (!orig) continue

    const fieldChanges: FieldChange[] = []

    if (orig.status !== updatedItem.status)
      fieldChanges.push({ field: 'status', from: orig.status, to: updatedItem.status })

    if (orig.priority !== updatedItem.priority)
      fieldChanges.push({ field: 'priority', from: orig.priority, to: updatedItem.priority })

    if ((orig.notes ?? '') !== (updatedItem.notes ?? ''))
      fieldChanges.push({ field: 'notes', from: orig.notes ?? '—', to: updatedItem.notes ?? '—' })

    if (orig.ownerArea !== updatedItem.ownerArea)
      fieldChanges.push({ field: 'ownerArea', from: orig.ownerArea, to: updatedItem.ownerArea })

    if (orig.technicalArea !== updatedItem.technicalArea)
      fieldChanges.push({ field: 'technicalArea', from: orig.technicalArea, to: updatedItem.technicalArea })

    if (orig.evidence.length !== updatedItem.evidence.length)
      fieldChanges.push({
        field: 'evidence',
        from: `${orig.evidence.length} item(s)`,
        to: `${updatedItem.evidence.length} item(s)`,
      })

    if (JSON.stringify(orig.blockingIssues) !== JSON.stringify(updatedItem.blockingIssues))
      fieldChanges.push({
        field: 'blockingIssues',
        from: `${orig.blockingIssues.length} item(s)`,
        to: `${updatedItem.blockingIssues.length} item(s)`,
      })

    if (JSON.stringify(orig.acceptanceCriteria) !== JSON.stringify(updatedItem.acceptanceCriteria))
      fieldChanges.push({
        field: 'acceptanceCriteria',
        from: `${orig.acceptanceCriteria.length} critério(s)`,
        to: `${updatedItem.acceptanceCriteria.length} critério(s)`,
      })

    if (JSON.stringify(orig.validationMethods) !== JSON.stringify(updatedItem.validationMethods))
      fieldChanges.push({
        field: 'validationMethods',
        from: orig.validationMethods.join(', ') || '—',
        to: updatedItem.validationMethods.join(', ') || '—',
      })

    if (JSON.stringify(orig.invariants ?? []) !== JSON.stringify(updatedItem.invariants ?? []))
      fieldChanges.push({
        field: 'invariants',
        from: `${(orig.invariants ?? []).length} invariante(s)`,
        to: `${(updatedItem.invariants ?? []).length} invariante(s)`,
      })

    if (JSON.stringify(orig.requires ?? []) !== JSON.stringify(updatedItem.requires ?? []))
      fieldChanges.push({
        field: 'requires',
        from: (orig.requires ?? []).join(', ') || '—',
        to: (updatedItem.requires ?? []).join(', ') || '—',
      })

    if ((orig.validationDomain ?? '') !== (updatedItem.validationDomain ?? ''))
      fieldChanges.push({
        field: 'validationDomain',
        from: orig.validationDomain ?? '—',
        to: updatedItem.validationDomain ?? '—',
      })

    const origScore = orig.confidence?.score ?? 0
    const updScore = updatedItem.confidence?.score ?? 0
    if (origScore !== updScore)
      fieldChanges.push({
        field: 'confidence',
        from: `${origScore} (${orig.confidence?.level ?? '—'})`,
        to: `${updScore} (${updatedItem.confidence?.level ?? '—'})`,
      })

    if ((orig.freezeReason ?? '') !== (updatedItem.freezeReason ?? ''))
      fieldChanges.push({
        field: 'freezeReason',
        from: orig.freezeReason ?? '—',
        to: updatedItem.freezeReason ?? '—',
      })

    if (fieldChanges.length > 0)
      changes.push({ itemId: updatedItem.id, title: updatedItem.title, changes: fieldChanges })
  }

  return changes
}
