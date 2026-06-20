export type ValidationStatus =
  | 'VALIDATED'
  | 'IMPLEMENTED'
  | 'IN_PROGRESS'
  | 'PLANNED'
  | 'FUTURE'
  | 'BLOCKED'
  | 'NEEDS_REVIEW'
  | 'REVALIDATION_REQUIRED'

export type ValidationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type ValidationMethod =
  | 'unit_tests'
  | 'integration_tests'
  | 'e2e_tests'
  | 'manual_ux'
  | 'financial_invariant'
  | 'reconciliation'
  | 'security_audit'
  | 'sandbox'
  | 'production_review'

export type EvidenceType = 'route' | 'component' | 'config' | 'adr' | 'test' | 'pr'

export type InvariantStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_RUN'

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'

// Operator-readiness pillars — see docs/validation/VALIDATION_DOMAINS.md
// Each pillar answers one question on the Operator Readiness Dashboard.
export type ValidationDomain =
  | 'DOM-IDENTITY'    // Identity & Handles
  | 'DOM-MONEY-MOVE'  // Money Movement (wallet, P2P, QR, links)
  | 'DOM-MONEY-IN'    // Money In (funding)
  | 'DOM-MONEY-OUT'   // Money Out (withdrawals, settlement)
  | 'DOM-MERCHANT'    // Merchant
  | 'DOM-DEVELOPER'   // Developer Platform
  | 'DOM-LEDGER'      // Ledger & Accounting
  | 'DOM-TRUST'       // Trust, Compliance & Security
  | 'DOM-OPERATIONS'  // Operations
  | 'DOM-CONFORMANCE' // Protocol Conformance (BANZA L0 sandbox evidence)

export interface ConfidenceScore {
  score: number          // 0-100
  level: ConfidenceLevel // derived from score
  basis: string[]        // what contributed to the score
}

export interface ValidationEvidence {
  type: EvidenceType
  label: string
  ref: string
}

export interface ValidationInvariant {
  id: string
  name: string
  rule: string
  status: InvariantStatus
  lastChecked?: string
}

export interface ValidationHistory {
  timestamp: string              // ISO 8601
  from: ValidationStatus | null  // null on first creation
  to: ValidationStatus
  approvedBy: string
  fingerprint: string
  commit?: string
  reason: string
  evidence: string[]
}

export interface ValidationItem {
  id: string
  title: string
  categoryId: string
  validationDomain: ValidationDomain
  referenceSection: string
  description: string
  requirement: string
  status: ValidationStatus
  priority: ValidationPriority
  ownerArea: string
  technicalArea: string
  validationMethods: ValidationMethod[]
  acceptanceCriteria: string[]
  testCoverage: boolean
  evidence: ValidationEvidence[]
  notes?: string
  dependencies: string[]          // informational — all known dependencies
  requires: string[]              // enforcement — must be VALIDATED before this can be VALIDATED
  affects: string[]               // items that should be revalidated if this item changes
  revalidateWhenChanged: string[] // file glob patterns — if matched files change, trigger revalidation
  blockingIssues: string[]
  invariants: ValidationInvariant[]
  confidence: ConfidenceScore
  freezeReason?: string           // populated when status is REVALIDATION_REQUIRED
  lastValidatedAt?: string        // ISO date of most recent VALIDATED transition
  validatedAgainstCommit?: string // git commit hash at time of last VALIDATED transition
  history: ValidationHistory[]
  lastUpdated: string
}

export interface ValidationCategory {
  id: string
  name: string
  description: string
}

export interface ValidationMeta {
  version: string
  lastUpdated: string
  referenceVersion: string
  referenceFile: string
  description: string
}

export interface ValidationMatrix {
  meta: ValidationMeta
  categories: ValidationCategory[]
  items: ValidationItem[]
}

export interface GovernanceIssue {
  itemId: string
  severity: 'error' | 'warning'
  rule: string
  message: string
}

export interface ItemChange {
  itemId: string
  title: string
  changes: FieldChange[]
}

export interface FieldChange {
  field: string
  from: string
  to: string
}

// Categories where financial invariants are required for VALIDATED status
export const FINANCIAL_CRITICAL_CATEGORIES: ReadonlySet<string> = new Set([
  'cat-ledger',
  'cat-wallet',
  'cat-p2p',
  'cat-qr',
  'cat-payouts',
  'cat-refunds',
])

// Minimum confidence score required for VALIDATED status
export const VALIDATED_CONFIDENCE_THRESHOLD = 80

// Confidence level thresholds
export const CONFIDENCE_LEVELS: { min: number; level: ConfidenceLevel }[] = [
  { min: 80, level: 'VERY_HIGH' },
  { min: 60, level: 'HIGH' },
  { min: 40, level: 'MEDIUM' },
  { min: 0,  level: 'LOW' },
]

export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  for (const { min, level } of CONFIDENCE_LEVELS) {
    if (score >= min) return level
  }
  return 'LOW'
}

// Compute confidence score from item state
export function computeConfidence(item: ValidationItem): ConfidenceScore {
  const basis: string[] = []
  let score = 0

  if (item.evidence.length > 0) {
    score += 20
    basis.push('implementation evidence (+20)')
  }
  if (item.validationMethods.includes('unit_tests')) {
    score += 15
    basis.push('unit tests (+15)')
  }
  if (item.validationMethods.includes('integration_tests')) {
    score += 20
    basis.push('integration tests (+20)')
  }
  if (item.validationMethods.includes('e2e_tests') || item.validationMethods.includes('manual_ux')) {
    score += 15
    basis.push('E2E / manual UX (+15)')
  }
  if (item.validationMethods.includes('production_review') || item.validationMethods.includes('sandbox')) {
    score += 10
    basis.push('production / sandbox evidence (+10)')
  }

  // Invariant contribution: +20 if all pass (or none required)
  const isFinancial = FINANCIAL_CRITICAL_CATEGORIES.has(item.categoryId)
  if (isFinancial && item.invariants.length > 0) {
    const allPass = item.invariants.every((inv) => inv.status === 'PASS')
    if (allPass) {
      score += 20
      basis.push('all invariants PASS (+20)')
    } else {
      basis.push('invariants not all PASS (+0)')
    }
  } else if (!isFinancial) {
    score += 20
    basis.push('non-financial item (invariants not required, +20)')
  }

  return { score, level: confidenceLevelFromScore(score), basis }
}

export const ALL_STATUSES: ValidationStatus[] = [
  'VALIDATED', 'IMPLEMENTED', 'IN_PROGRESS', 'PLANNED', 'FUTURE',
  'BLOCKED', 'NEEDS_REVIEW', 'REVALIDATION_REQUIRED',
]

export const ALL_PRIORITIES: ValidationPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export const ALL_METHODS: ValidationMethod[] = [
  'unit_tests', 'integration_tests', 'e2e_tests', 'manual_ux',
  'financial_invariant', 'reconciliation', 'security_audit', 'sandbox', 'production_review',
]

export const ALL_EVIDENCE_TYPES: EvidenceType[] = [
  'route', 'component', 'config', 'adr', 'test', 'pr',
]

export const ALL_INVARIANT_STATUSES: InvariantStatus[] = ['PASS', 'FAIL', 'UNKNOWN', 'NOT_RUN']

export const ALL_DOMAINS: ValidationDomain[] = [
  'DOM-IDENTITY', 'DOM-MONEY-MOVE', 'DOM-MONEY-IN', 'DOM-MONEY-OUT',
  'DOM-MERCHANT', 'DOM-DEVELOPER', 'DOM-LEDGER', 'DOM-TRUST', 'DOM-OPERATIONS',
  'DOM-CONFORMANCE',
]

export const DOMAIN_LABELS: Record<ValidationDomain, string> = {
  'DOM-IDENTITY':   'Identity & Handles',
  'DOM-MONEY-MOVE': 'Money Movement',
  'DOM-MONEY-IN':   'Money In (Funding)',
  'DOM-MONEY-OUT':  'Money Out (Withdrawals)',
  'DOM-MERCHANT':   'Merchant',
  'DOM-DEVELOPER':  'Developer Platform',
  'DOM-LEDGER':     'Ledger & Accounting',
  'DOM-TRUST':      'Trust & Compliance',
  'DOM-OPERATIONS': 'Operations',
  'DOM-CONFORMANCE':'Protocol Conformance',
}

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  LOW:       'Baixa',
  MEDIUM:    'Média',
  HIGH:      'Alta',
  VERY_HIGH: 'Muito alta',
}

export const METHOD_LABELS: Record<ValidationMethod, string> = {
  unit_tests:          'Unit Tests',
  integration_tests:   'Integration Tests',
  e2e_tests:           'E2E Tests',
  manual_ux:           'UX Manual',
  financial_invariant: 'Invariante financeiro',
  reconciliation:      'Reconciliação',
  security_audit:      'Auditoria de segurança',
  sandbox:             'Sandbox',
  production_review:   'Revisão de produção',
}

export const INVARIANT_STATUS_LABELS: Record<InvariantStatus, string> = {
  PASS:    'PASS',
  FAIL:    'FAIL',
  UNKNOWN: 'UNKNOWN',
  NOT_RUN: 'NÃO EXECUTADO',
}

// Default confidence for items without one (safe fallback for migration)
export function defaultConfidence(): ConfidenceScore {
  return { score: 0, level: 'LOW', basis: [] }
}
