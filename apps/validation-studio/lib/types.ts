export type ValidationStatus =
  | 'VALIDATED'
  | 'IMPLEMENTED'
  | 'IN_PROGRESS'
  | 'PLANNED'
  | 'FUTURE'
  | 'BLOCKED'
  | 'NEEDS_REVIEW'

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
  dependencies: string[]      // informational — all known dependencies
  requires: string[]          // enforcement — must be VALIDATED before this can be VALIDATED
  blockingIssues: string[]
  invariants: ValidationInvariant[]
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

export const ALL_STATUSES: ValidationStatus[] = [
  'VALIDATED', 'IMPLEMENTED', 'IN_PROGRESS', 'PLANNED', 'FUTURE', 'BLOCKED', 'NEEDS_REVIEW',
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
