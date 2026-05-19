import type {
  ValidationMatrix,
  ValidationItem,
  GovernanceIssue,
  InvariantStatus,
} from './types'
import { FINANCIAL_CRITICAL_CATEGORIES } from './types'

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

  // VALIDATED → evidence required
  if (item.status === 'VALIDATED' && item.evidence.length === 0)
    issues.push({
      itemId: item.id, severity: 'error', rule: 'VALIDATED_NO_EVIDENCE',
      message: 'VALIDATED requer pelo menos uma evidência documentada',
    })

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
  if (item.status !== 'VALIDATED') return []

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
