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

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'

export type ValidationDomain =
  | 'DOM-FIN'
  | 'DOM-IDENTITY'
  | 'DOM-CONSUMER'
  | 'DOM-MERCHANT'
  | 'DOM-DEV'
  | 'DOM-SEC'
  | 'DOM-COMPLIANCE'
  | 'DOM-OPS'
  | 'DOM-OBS'
  | 'DOM-INFRA'
  | 'DOM-DOCS'

export interface ConfidenceScore {
  score: number
  level: ConfidenceLevel
  basis: string[]
}

export interface ValidationEvidence {
  type: EvidenceType
  label: string
  ref?: string
}

export interface ValidationInvariant {
  id: string
  name: string
  rule: string
  status: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_RUN'
  lastChecked?: string
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
  dependencies: string[]
  requires: string[]
  affects: string[]
  revalidateWhenChanged: string[]
  blockingIssues: string[]
  invariants: ValidationInvariant[]
  confidence: ConfidenceScore
  freezeReason?: string
  lastValidatedAt?: string
  validatedAgainstCommit?: string
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

export interface DomainMetrics {
  domain: ValidationDomain
  label: string
  total: number
  validated: number
  implemented: number
  done: number
  completionPct: number
  avgConfidence: number
  revalidationRequired: number
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
  revalidationRequired: number
  testCoverageCount: number
  testCoveragePct: number
  architectureIntegrityPct: number
  avgConfidence: number
  byCategory: CategoryMetrics[]
  byDomain: DomainMetrics[]
}

export const DOMAIN_LABELS: Record<ValidationDomain, string> = {
  'DOM-FIN':        'Financial Integrity',
  'DOM-IDENTITY':   'Wallet & Identity',
  'DOM-CONSUMER':   'Consumer Experience',
  'DOM-MERCHANT':   'Merchant Experience',
  'DOM-DEV':        'Developer Platform',
  'DOM-SEC':        'Security',
  'DOM-COMPLIANCE': 'Compliance',
  'DOM-OPS':        'Operations',
  'DOM-OBS':        'Observability',
  'DOM-INFRA':      'Infrastructure',
  'DOM-DOCS':       'Docs & Governance',
}
