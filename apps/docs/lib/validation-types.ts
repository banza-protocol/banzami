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

export type EvidenceType =
  | 'route'
  | 'api_endpoint'
  | 'component'
  | 'test_file'
  | 'screenshot'
  | 'migration'
  | 'sdk_method'
  | 'architecture_module'
  | 'webhook'
  | 'manual_qa'
  | 'adr'
  | 'config'

export interface ValidationEvidence {
  type: EvidenceType
  label: string
  ref?: string
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
  dependencies: string[]
  blockingIssues: string[]
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

export interface CategoryMetrics {
  categoryId: string
  total: number
  validated: number
  implemented: number
  done: number
  completionPct: number
}

export interface ValidationMetrics {
  total: number
  validated: number
  implemented: number
  inProgress: number
  planned: number
  future: number
  blocked: number
  needsReview: number
  testCoverageCount: number
  testCoveragePct: number
  architectureIntegrityPct: number
  byCategory: CategoryMetrics[]
}
