import fs from 'fs'
import path from 'path'
import type {
  ValidationMatrix,
  ValidationMetrics,
  CategoryMetrics,
  ValidationItem,
} from './validation-types'

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
  const testCoverageCount = items.filter((i) => i.testCoverage).length
  const testCoveragePct = total > 0 ? Math.round((testCoverageCount / total) * 100) : 0

  // Architecture integrity: % of items (excl. FUTURE) that are VALIDATED or IMPLEMENTED
  const active = items.filter((i) => i.status !== 'FUTURE')
  const activeDone = active.filter((i) =>
    ['VALIDATED', 'IMPLEMENTED'].includes(i.status),
  ).length
  const architectureIntegrityPct =
    active.length > 0 ? Math.round((activeDone / active.length) * 100) : 0

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

  return {
    total,
    validated,
    implemented,
    inProgress,
    planned,
    future,
    blocked,
    needsReview,
    testCoverageCount,
    testCoveragePct,
    architectureIntegrityPct,
    byCategory,
  }
}
