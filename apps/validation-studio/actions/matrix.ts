'use server'

import { readMatrix, writeMatrix, computeChangeSummary, appendHistory } from '@/lib/matrix'
import { checkMatrix, checkItem, checkRequires, hasErrors } from '@/lib/governance'
import { computeFingerprint } from '@/lib/fingerprint'
import { gitDiff } from '@/lib/git'
import { MATRIX_REPO_PATH } from '@/lib/matrix'
import type { ValidationMatrix, ValidationItem, GovernanceIssue } from '@/lib/types'

export async function loadMatrix(): Promise<ValidationMatrix> {
  return readMatrix()
}

export async function validateItem(
  item: ValidationItem,
  allItems: ValidationItem[],
): Promise<GovernanceIssue[]> {
  return [...checkItem(item), ...checkRequires(item, allItems)]
}

export async function previewSave(original: ValidationMatrix, updated: ValidationMatrix) {
  const issues = checkMatrix(updated)
  const changes = computeChangeSummary(original, updated)

  // Compute fingerprint for the first changed item (covers Studio single-item edit flow)
  let fingerprint: string | undefined
  if (changes.length > 0) {
    const changedId = changes[0].itemId
    const item = original.items.find((i) => i.id === changedId)
    const updatedItem = updated.items.find((i) => i.id === changedId)
    if (item && updatedItem) {
      const currentDiff = gitDiff(MATRIX_REPO_PATH)
      fingerprint = computeFingerprint({
        item,
        gitDiff: currentDiff,
        proposedPatch: { status: updatedItem.status, evidence: updatedItem.evidence },
      })
    }
  }

  return { issues, changes, fingerprint }
}

export async function saveMatrix(
  original: ValidationMatrix,
  updated: ValidationMatrix,
  options?: {
    approvedBy?: string
    fingerprint?: string
    reason?: string
  },
): Promise<{ ok: boolean; errors: GovernanceIssue[] }> {
  const issues = checkMatrix(updated)
  const errors = issues.filter((i) => i.severity === 'error')

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const today = new Date().toISOString().split('T')[0]
  updated.meta.lastUpdated = today

  // Append immutable history entry for each item whose status changed
  const updatedItems = updated.items.map((item) => {
    const orig = original.items.find((o) => o.id === item.id)
    if (!orig || orig.status === item.status) return item

    return appendHistory(item, {
      from: orig.status,
      to: item.status,
      approvedBy: options?.approvedBy ?? 'local-admin',
      fingerprint: options?.fingerprint ?? 'studio-save',
      reason: options?.reason ?? `Status alterado de ${orig.status} para ${item.status} via Validation Studio`,
      evidence: item.evidence.map((e) => e.ref),
    })
  })

  writeMatrix({ ...updated, items: updatedItems })
  return { ok: true, errors: [] }
}
