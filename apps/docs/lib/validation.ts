import fs from 'fs'
import path from 'path'
import type {
  ValidationMatrix,
  ValidationMetrics,
  CategoryMetrics,
  DomainMetrics,
  ValidationItem,
  ValidationDomain,
} from './validation-types'
import { DOMAIN_LABELS } from './validation-types'

// READ-ONLY: this module only reads validation data at build time.
// No write path exists. Updates must go through Git → review → deploy.
const MATRIX_PATH = path.join(
  process.cwd(),
  '../../docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json',
)

/** Read-only loader — runs server-side at build time only. Never call from a mutation handler. */
export function getValidationMatrix(): Readonly<ValidationMatrix> {
  const raw = fs.readFileSync(MATRIX_PATH, 'utf-8')
  return Object.freeze(JSON.parse(raw) as ValidationMatrix)
}

export function computeMetrics(
  items: ValidationItem[],
  categories: ValidationMatrix['categories'],
): ValidationMetrics {
  const total = items.length
  const validated = items.filter((i) => i.status === 'VALIDATED').length
  const implemented = items.filter((i) => i.status === 'IMPLEMENTED').length
  const inProgress = items.filter((i) => i.status === 'IN_PROGRESS').length
  const planned = items.filter((i) => i.status === 'PLANNED').length
  const future = items.filter((i) => i.status === 'FUTURE').length
  const blocked = items.filter((i) => i.status === 'BLOCKED').length
  const needsReview = items.filter((i) => i.status === 'NEEDS_REVIEW').length
  const revalidationRequired = items.filter((i) => i.status === 'REVALIDATION_REQUIRED').length
  const testCoverageCount = items.filter((i) => i.testCoverage).length
  const testCoveragePct = total > 0 ? Math.round((testCoverageCount / total) * 100) : 0

  // Architecture integrity: % of items (excl. FUTURE) that are VALIDATED or IMPLEMENTED
  const active = items.filter((i) => i.status !== 'FUTURE')
  const activeDone = active.filter((i) =>
    ['VALIDATED', 'IMPLEMENTED'].includes(i.status),
  ).length
  const architectureIntegrityPct =
    active.length > 0 ? Math.round((activeDone / active.length) * 100) : 0

  // Average confidence score
  const itemsWithConfidence = items.filter((i) => i.confidence?.score !== undefined)
  const avgConfidence =
    itemsWithConfidence.length > 0
      ? Math.round(
          itemsWithConfidence.reduce((sum, i) => sum + (i.confidence?.score ?? 0), 0) /
            itemsWithConfidence.length,
        )
      : 0

  const byCategory: CategoryMetrics[] = categories.map((cat) => {
    const catItems = items.filter((i) => i.categoryId === cat.id)
    const catTotal = catItems.length
    const catValidated = catItems.filter((i) => i.status === 'VALIDATED').length
    const catImplemented = catItems.filter((i) => i.status === 'IMPLEMENTED').length
    const catDone = catValidated + catImplemented
    return {
      categoryId: cat.id,
      total: catTotal,
      validated: catValidated,
      implemented: catImplemented,
      done: catDone,
      completionPct: catTotal > 0 ? Math.round((catDone / catTotal) * 100) : 0,
    }
  })

  // Domain metrics
  const allDomains: ValidationDomain[] = [
    'DOM-FIN', 'DOM-IDENTITY', 'DOM-CONSUMER', 'DOM-MERCHANT',
    'DOM-DEV', 'DOM-SEC', 'DOM-COMPLIANCE', 'DOM-OPS', 'DOM-OBS',
    'DOM-INFRA', 'DOM-DOCS',
  ]
  const byDomain: DomainMetrics[] = allDomains
    .map((domain) => {
      const domItems = items.filter((i) => i.validationDomain === domain)
      if (domItems.length === 0) return null
      const domValidated = domItems.filter((i) => i.status === 'VALIDATED').length
      const domImplemented = domItems.filter((i) => i.status === 'IMPLEMENTED').length
      const domDone = domValidated + domImplemented
      const domRevalidation = domItems.filter((i) => i.status === 'REVALIDATION_REQUIRED').length
      const domConfItems = domItems.filter((i) => i.confidence?.score !== undefined)
      const domAvgConf =
        domConfItems.length > 0
          ? Math.round(
              domConfItems.reduce((s, i) => s + (i.confidence?.score ?? 0), 0) / domConfItems.length,
            )
          : 0
      return {
        domain,
        label: DOMAIN_LABELS[domain],
        total: domItems.length,
        validated: domValidated,
        implemented: domImplemented,
        done: domDone,
        completionPct:
          domItems.length > 0 ? Math.round((domDone / domItems.length) * 100) : 0,
        avgConfidence: domAvgConf,
        revalidationRequired: domRevalidation,
      }
    })
    .filter((d): d is DomainMetrics => d !== null)

  return {
    total,
    validated,
    implemented,
    inProgress,
    planned,
    future,
    blocked,
    needsReview,
    revalidationRequired,
    testCoverageCount,
    testCoveragePct,
    architectureIntegrityPct,
    avgConfidence,
    byCategory,
    byDomain,
  }
}
