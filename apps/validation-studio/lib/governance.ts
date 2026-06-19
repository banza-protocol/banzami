import type {
  ValidationMatrix,
  ValidationItem,
  GovernanceIssue,
  InvariantStatus,
  ConfidenceScore,
} from './types'
import {
  FINANCIAL_CRITICAL_CATEGORIES,
  VALIDATED_CONFIDENCE_THRESHOLD,
  computeConfidence,
} from './types'

// ─── Single-item checks (no matrix context needed) ────────────────────────────

export function checkItem(item: ValidationItem): GovernanceIssue[] {
  const issues: GovernanceIssue[] = []

  // Required text fields
  if (!item.title?.trim())
    issues.push({ itemId: item.id, severity: 'error', rule: 'EMPTY_TITLE', message: 'Title não pode ser vazio' })
  if (!item.requirement?.trim())
    issues.push({ itemId: item.id, severity: 'error', rule: 'EMPTY_REQUIREMENT', message: 'Requirement não pode ser vazio' })
  if (!item.referenceSection?.trim())
    issues.push({ itemId: item.id, severity: 'error', rule: 'EMPTY_REFERENCE', message: 'ReferenceSection não pode ser vazio' })

  // Validation domain required
  if (!item.validationDomain?.trim())
    issues.push({
      itemId: item.id, severity: 'error', rule: 'MISSING_DOMAIN',
      message: 'Validation domain obrigatório — ver VALIDATION_DOMAINS.md',
    })

  // VALIDATED → evidence required
  if (item.status === 'VALIDATED' && item.evidence.length === 0)
    issues.push({
      itemId: item.id, severity: 'error', rule: 'VALIDATED_NO_EVIDENCE',
      message: 'VALIDATED requer pelo menos uma evidência documentada',
    })

  // VALIDATED → confidence (hybrid model).
  // The stored `confidence.score` is the §16 source of truth; `computeConfidence`
  // is an advisory evidence-derived estimate used only for drift detection.
  //   • stored < 80                        → ERROR  (real §16 violation)
  //   • stored ≥ 80 but derived < 80       → WARNING CONFIDENCE_DRIFT (advisory)
  //   • both ≥ 80                           → no issue
  if (item.status === 'VALIDATED') {
    const stored = item.confidence?.score ?? 0
    const derived = computeConfidence(item).score
    if (stored < VALIDATED_CONFIDENCE_THRESHOLD) {
      issues.push({
        itemId: item.id, severity: 'error', rule: 'VALIDATED_LOW_CONFIDENCE',
        message: `VALIDATED requer confidence >= ${VALIDATED_CONFIDENCE_THRESHOLD} (actual: ${stored})`,
      })
    } else if (derived < VALIDATED_CONFIDENCE_THRESHOLD) {
      issues.push({
        itemId: item.id, severity: 'warning', rule: 'CONFIDENCE_DRIFT',
        message: `confidence aprovada (${stored}) válida, mas a estimativa derivada das validationMethods/evidence é ${derived} — metadados podem estar incompletos (advisory; não altera o status VALIDATED)`,
      })
    }
  }

  // IMPLEMENTED → evidence recommended
  if (item.status === 'IMPLEMENTED' && item.evidence.length === 0)
    issues.push({
      itemId: item.id, severity: 'warning', rule: 'IMPLEMENTED_NO_EVIDENCE',
      message: 'IMPLEMENTED deveria ter evidência de localização de código',
    })

  // BLOCKED → blocking issues required
  if (item.status === 'BLOCKED' && item.blockingIssues.length === 0)
    issues.push({
      itemId: item.id, severity: 'error', rule: 'BLOCKED_NO_REASON',
      message: 'BLOCKED requer pelo menos uma razão em blockingIssues',
    })

  // REVALIDATION_REQUIRED → freeze reason recommended
  if (item.status === 'REVALIDATION_REQUIRED' && !item.freezeReason?.trim())
    issues.push({
      itemId: item.id, severity: 'warning', rule: 'REVALIDATION_NO_REASON',
      message: 'REVALIDATION_REQUIRED deve incluir freezeReason explicando o motivo',
    })

  // CRITICAL → acceptance criteria recommended
  if (item.priority === 'CRITICAL' && item.acceptanceCriteria.length === 0)
    issues.push({
      itemId: item.id, severity: 'warning', rule: 'CRITICAL_NO_CRITERIA',
      message: 'Item CRÍTICO sem critérios de aceitação definidos',
    })

  // Evidence entries must have non-empty label and ref
  for (const ev of item.evidence) {
    if (!ev.label?.trim() || !ev.ref?.trim()) {
      issues.push({
        itemId: item.id, severity: 'warning', rule: 'EVIDENCE_INCOMPLETE',
        message: 'Uma entrada de evidência tem label ou ref vazio',
      })
      break
    }
  }

  // Financial invariant checks
  issues.push(...checkInvariants(item))

  return issues
}

// ─── Financial invariant checks ───────────────────────────────────────────────

export function checkInvariants(item: ValidationItem): GovernanceIssue[] {
  if (!FINANCIAL_CRITICAL_CATEGORIES.has(item.categoryId)) return []
  if (item.status !== 'VALIDATED' && item.status !== 'REVALIDATION_REQUIRED') return []

  const issues: GovernanceIssue[] = []

  if (item.invariants.length === 0) {
    issues.push({
      itemId: item.id, severity: 'error', rule: 'FINANCIAL_NO_INVARIANTS',
      message: `Item financeiro crítico (${item.categoryId}) requer invariantes definidos para ser VALIDATED`,
    })
    return issues
  }

  const notPassing = item.invariants.filter((inv) => inv.status !== 'PASS')
  for (const inv of notPassing) {
    const statusLabel: Record<InvariantStatus, string> = {
      PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', NOT_RUN: 'NÃO EXECUTADO',
    }
    issues.push({
      itemId: item.id, severity: 'error', rule: 'INVARIANT_NOT_PASS',
      message: `Invariante "${inv.name}" não está PASS (${statusLabel[inv.status]}) — obrigatório para VALIDATED`,
    })
  }

  return issues
}

// ─── Architecture lock (requires VALIDATED dependencies) ──────────────────────

/**
 * Check that all `requires` entries are VALIDATED in the full matrix.
 * Separate from checkItem because it needs full matrix context.
 */
export function checkRequires(
  item: ValidationItem,
  allItems: ValidationItem[],
): GovernanceIssue[] {
  if (item.status !== 'VALIDATED') return []
  if (!item.requires || item.requires.length === 0) return []

  const issues: GovernanceIssue[] = []
  const itemIndex = new Map(allItems.map((i) => [i.id, i]))

  for (const reqId of item.requires) {
    const required = itemIndex.get(reqId)
    if (!required) {
      issues.push({
        itemId: item.id, severity: 'error', rule: 'REQUIRES_MISSING',
        message: `Dependência obrigatória "${reqId}" não encontrada na matriz`,
      })
    } else if (required.status !== 'VALIDATED') {
      issues.push({
        itemId: item.id, severity: 'error', rule: 'REQUIRES_NOT_VALIDATED',
        message: `${item.id} requer ${reqId} como VALIDATED (estado actual: ${required.status})`,
      })
    }
  }

  return issues
}

/**
 * Return items that are blocking a given item from becoming VALIDATED.
 * Useful for UI lock indicators.
 */
export function getRequiresBlockers(
  item: ValidationItem,
  allItems: ValidationItem[],
): ValidationItem[] {
  if (!item.requires || item.requires.length === 0) return []
  const itemIndex = new Map(allItems.map((i) => [i.id, i]))
  return item.requires
    .map((id) => itemIndex.get(id))
    .filter((r): r is ValidationItem => r !== undefined && r.status !== 'VALIDATED')
}

/**
 * Return items downstream of this item (listed in this item's `affects[]`).
 * These may need revalidation if this item changes.
 */
export function getAffectedItems(
  item: ValidationItem,
  allItems: ValidationItem[],
): ValidationItem[] {
  if (!item.affects || item.affects.length === 0) return []
  const itemIndex = new Map(allItems.map((i) => [i.id, i]))
  return item.affects
    .map((id) => itemIndex.get(id))
    .filter((r): r is ValidationItem => r !== undefined)
}

/**
 * Return items that have this item in their `requires[]` — i.e., items that
 * depend on this item being VALIDATED.
 */
export function getDependents(
  item: ValidationItem,
  allItems: ValidationItem[],
): ValidationItem[] {
  return allItems.filter((other) => (other.requires ?? []).includes(item.id))
}

// ─── Revalidation checks ──────────────────────────────────────────────────────

/**
 * Check if a VALIDATED item's confidence score is computed correctly.
 * Returns the live-computed confidence score (does not mutate the item).
 */
export function computeLiveConfidence(item: ValidationItem): ConfidenceScore {
  return computeConfidence(item)
}

// ─── Full matrix checks ───────────────────────────────────────────────────────

export function checkMatrix(matrix: ValidationMatrix): GovernanceIssue[] {
  const issues: GovernanceIssue[] = []
  const validCategoryIds = new Set(matrix.categories.map((c) => c.id))
  const seenIds = new Set<string>()

  for (const item of matrix.items) {
    if (seenIds.has(item.id)) {
      issues.push({
        itemId: item.id, severity: 'error', rule: 'DUPLICATE_ID',
        message: `ID duplicado: ${item.id}`,
      })
    }
    seenIds.add(item.id)

    if (!validCategoryIds.has(item.categoryId)) {
      issues.push({
        itemId: item.id, severity: 'error', rule: 'INVALID_CATEGORY',
        message: `categoryId inválido: "${item.categoryId}"`,
      })
    }

    issues.push(...checkItem(item))
    issues.push(...checkRequires(item, matrix.items))
  }

  return issues
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function issuesForItem(itemId: string, issues: GovernanceIssue[]): GovernanceIssue[] {
  return issues.filter((i) => i.itemId === itemId)
}

export function hasErrors(issues: GovernanceIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}

export function isFinancialCritical(categoryId: string): boolean {
  return FINANCIAL_CRITICAL_CATEGORIES.has(categoryId)
}
