import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { computeMetrics } from '@/lib/validation'
import type {
  ValidationItem,
  ValidationCategory,
  ValidationMatrix,
  ValidationMetrics,
} from '@/lib/validation-types'

// ─── Fixture factories ─────────────────────────────────────────────────────────

const DEFAULT_CAT: ValidationCategory = { id: 'cat-docs', name: 'Docs', description: '' }

function makeItem(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    id: 'TEST-001',
    title: 'Test item',
    categoryId: 'cat-docs',
    validationDomain: 'DOM-DOCS',
    referenceSection: '§1',
    description: 'A test item',
    requirement: 'Must do something',
    status: 'PLANNED',
    priority: 'MEDIUM',
    ownerArea: 'Engineering',
    technicalArea: 'TypeScript',
    validationMethods: [],
    acceptanceCriteria: [],
    testCoverage: false,
    evidence: [],
    dependencies: [],
    requires: [],
    affects: [],
    revalidateWhenChanged: [],
    blockingIssues: [],
    invariants: [],
    confidence: { score: 20, level: 'LOW', basis: [] },
    lastUpdated: '2026-05-20',
    ...overrides,
  }
}

// ─── computeMetrics — status counts ───────────────────────────────────────────

describe('computeMetrics — status counts', () => {
  it('counts each status correctly', () => {
    const items: ValidationItem[] = [
      makeItem({ id: 'A', status: 'VALIDATED' }),
      makeItem({ id: 'B', status: 'VALIDATED' }),
      makeItem({ id: 'C', status: 'IMPLEMENTED' }),
      makeItem({ id: 'D', status: 'IN_PROGRESS' }),
      makeItem({ id: 'E', status: 'PLANNED' }),
      makeItem({ id: 'F', status: 'FUTURE' }),
      makeItem({ id: 'G', status: 'BLOCKED' }),
      makeItem({ id: 'H', status: 'NEEDS_REVIEW' }),
      makeItem({ id: 'I', status: 'REVALIDATION_REQUIRED' }),
    ]
    const metrics = computeMetrics(items, [DEFAULT_CAT])
    expect(metrics.total).toBe(9)
    expect(metrics.validated).toBe(2)
    expect(metrics.implemented).toBe(1)
    expect(metrics.inProgress).toBe(1)
    expect(metrics.planned).toBe(1)
    expect(metrics.future).toBe(1)
    expect(metrics.blocked).toBe(1)
    expect(metrics.needsReview).toBe(1)
    expect(metrics.revalidationRequired).toBe(1)
  })

  it('returns all zeros for an empty item list', () => {
    const metrics = computeMetrics([], [DEFAULT_CAT])
    expect(metrics.total).toBe(0)
    expect(metrics.validated).toBe(0)
    expect(metrics.implemented).toBe(0)
    expect(metrics.testCoveragePct).toBe(0)
    expect(metrics.architectureIntegrityPct).toBe(0)
    expect(metrics.avgConfidence).toBe(0)
  })
})

// ─── computeMetrics — testCoveragePct ─────────────────────────────────────────

describe('computeMetrics — testCoveragePct', () => {
  it('returns 100 when all items have testCoverage true', () => {
    const items = [
      makeItem({ id: 'A', testCoverage: true }),
      makeItem({ id: 'B', testCoverage: true }),
    ]
    expect(computeMetrics(items, [DEFAULT_CAT]).testCoveragePct).toBe(100)
  })

  it('returns 0 when no items have testCoverage', () => {
    const items = [makeItem({ id: 'A', testCoverage: false }), makeItem({ id: 'B', testCoverage: false })]
    expect(computeMetrics(items, [DEFAULT_CAT]).testCoveragePct).toBe(0)
  })

  it('returns 50 when half have testCoverage', () => {
    const items = [
      makeItem({ id: 'A', testCoverage: true }),
      makeItem({ id: 'B', testCoverage: false }),
    ]
    expect(computeMetrics(items, [DEFAULT_CAT]).testCoveragePct).toBe(50)
  })
})

// ─── computeMetrics — architectureIntegrityPct ────────────────────────────────

describe('computeMetrics — architectureIntegrityPct', () => {
  it('excludes FUTURE items from the calculation', () => {
    const items: ValidationItem[] = [
      makeItem({ id: 'A', status: 'VALIDATED' }),
      makeItem({ id: 'B', status: 'FUTURE' }),
    ]
    // Only A is active (non-FUTURE). A is VALIDATED. 1/1 = 100%
    expect(computeMetrics(items, [DEFAULT_CAT]).architectureIntegrityPct).toBe(100)
  })

  it('counts both VALIDATED and IMPLEMENTED as "done"', () => {
    const items: ValidationItem[] = [
      makeItem({ id: 'A', status: 'VALIDATED' }),
      makeItem({ id: 'B', status: 'IMPLEMENTED' }),
      makeItem({ id: 'C', status: 'PLANNED' }),
      makeItem({ id: 'D', status: 'PLANNED' }),
    ]
    // 2 done / 4 active = 50%
    expect(computeMetrics(items, [DEFAULT_CAT]).architectureIntegrityPct).toBe(50)
  })

  it('returns 0 when all items are PLANNED (nothing done)', () => {
    const items = [makeItem({ id: 'A', status: 'PLANNED' }), makeItem({ id: 'B', status: 'PLANNED' })]
    expect(computeMetrics(items, [DEFAULT_CAT]).architectureIntegrityPct).toBe(0)
  })

  it('returns 0 for empty item list', () => {
    expect(computeMetrics([], [DEFAULT_CAT]).architectureIntegrityPct).toBe(0)
  })
})

// ─── computeMetrics — avgConfidence ───────────────────────────────────────────

describe('computeMetrics — avgConfidence', () => {
  it('computes the average confidence score across all items', () => {
    const items = [
      makeItem({ id: 'A', confidence: { score: 40, level: 'MEDIUM', basis: [] } }),
      makeItem({ id: 'B', confidence: { score: 80, level: 'VERY_HIGH', basis: [] } }),
    ]
    // (40 + 80) / 2 = 60
    expect(computeMetrics(items, [DEFAULT_CAT]).avgConfidence).toBe(60)
  })

  it('rounds to nearest integer', () => {
    const items = [
      makeItem({ id: 'A', confidence: { score: 65, level: 'HIGH', basis: [] } }),
      makeItem({ id: 'B', confidence: { score: 66, level: 'HIGH', basis: [] } }),
    ]
    // (65 + 66) / 2 = 65.5 → rounds to 66
    expect(computeMetrics(items, [DEFAULT_CAT]).avgConfidence).toBe(66)
  })

  it('returns 0 for empty item list', () => {
    expect(computeMetrics([], [DEFAULT_CAT]).avgConfidence).toBe(0)
  })
})

// ─── computeMetrics — byCategory ──────────────────────────────────────────────

describe('computeMetrics — byCategory', () => {
  it('produces one entry per category', () => {
    const categories: ValidationCategory[] = [
      { id: 'cat-docs', name: 'Docs', description: '' },
      { id: 'cat-ledger', name: 'Ledger', description: '' },
    ]
    const items: ValidationItem[] = [
      makeItem({ id: 'A', categoryId: 'cat-docs', status: 'VALIDATED' }),
      makeItem({ id: 'B', categoryId: 'cat-ledger', status: 'IMPLEMENTED' }),
    ]
    const metrics = computeMetrics(items, categories)
    expect(metrics.byCategory).toHaveLength(2)
  })

  it('computes correct done/total and completionPct per category', () => {
    const categories: ValidationCategory[] = [{ id: 'cat-docs', name: 'Docs', description: '' }]
    const items: ValidationItem[] = [
      makeItem({ id: 'A', categoryId: 'cat-docs', status: 'VALIDATED' }),
      makeItem({ id: 'B', categoryId: 'cat-docs', status: 'IMPLEMENTED' }),
      makeItem({ id: 'C', categoryId: 'cat-docs', status: 'PLANNED' }),
      makeItem({ id: 'D', categoryId: 'cat-docs', status: 'PLANNED' }),
    ]
    const cat = computeMetrics(items, categories).byCategory[0]
    expect(cat.total).toBe(4)
    expect(cat.validated).toBe(1)
    expect(cat.implemented).toBe(1)
    expect(cat.done).toBe(2)
    expect(cat.completionPct).toBe(50)
  })

  it('produces completionPct 0 for empty category', () => {
    const categories: ValidationCategory[] = [
      { id: 'cat-docs', name: 'Docs', description: '' },
      { id: 'cat-empty', name: 'Empty', description: '' },
    ]
    const items = [makeItem({ id: 'A', categoryId: 'cat-docs', status: 'PLANNED' })]
    const empty = computeMetrics(items, categories).byCategory.find((c) => c.categoryId === 'cat-empty')!
    expect(empty.total).toBe(0)
    expect(empty.completionPct).toBe(0)
  })
})

// ─── computeMetrics — byDomain ────────────────────────────────────────────────

describe('computeMetrics — byDomain', () => {
  it('omits domains that have no items', () => {
    const items = [makeItem({ id: 'A', validationDomain: 'DOM-DOCS' })]
    const metrics = computeMetrics(items, [DEFAULT_CAT])
    const domains = metrics.byDomain.map((d) => d.domain)
    expect(domains).toContain('DOM-DOCS')
    expect(domains).not.toContain('DOM-FIN')
    expect(domains).not.toContain('DOM-SEC')
  })

  it('computes correct metrics per domain', () => {
    const items: ValidationItem[] = [
      makeItem({ id: 'A', validationDomain: 'DOM-DOCS', status: 'VALIDATED', confidence: { score: 80, level: 'VERY_HIGH', basis: [] } }),
      makeItem({ id: 'B', validationDomain: 'DOM-DOCS', status: 'IMPLEMENTED', confidence: { score: 65, level: 'HIGH', basis: [] } }),
      makeItem({ id: 'C', validationDomain: 'DOM-DOCS', status: 'PLANNED', confidence: { score: 20, level: 'LOW', basis: [] } }),
    ]
    const domain = computeMetrics(items, [DEFAULT_CAT]).byDomain.find((d) => d.domain === 'DOM-DOCS')!
    expect(domain.total).toBe(3)
    expect(domain.validated).toBe(1)
    expect(domain.implemented).toBe(1)
    expect(domain.done).toBe(2)
    // completionPct: 2/3 = 66.67 → 67
    expect(domain.completionPct).toBe(67)
    // avgConfidence: (80+65+20)/3 = 55 → 55
    expect(domain.avgConfidence).toBe(55)
    expect(domain.revalidationRequired).toBe(0)
  })

  it('counts REVALIDATION_REQUIRED items per domain', () => {
    const items: ValidationItem[] = [
      makeItem({ id: 'A', validationDomain: 'DOM-OPS', status: 'REVALIDATION_REQUIRED' }),
      makeItem({ id: 'B', validationDomain: 'DOM-OPS', status: 'IMPLEMENTED' }),
    ]
    const domain = computeMetrics(items, [DEFAULT_CAT]).byDomain.find((d) => d.domain === 'DOM-OPS')!
    expect(domain.revalidationRequired).toBe(1)
  })
})

// ─── BANZAMI_IMPLEMENTATION_MATRIX.json — structural integrity ────────────────

describe('BANZAMI_IMPLEMENTATION_MATRIX.json — structural integrity', () => {
  const MATRIX_PATH = path.resolve(__dirname, '../../../../docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json')
  const raw = fs.readFileSync(MATRIX_PATH, 'utf-8')
  const matrix: ValidationMatrix = JSON.parse(raw)
  const { items, categories } = matrix

  it('parses without error and has items', () => {
    expect(items.length).toBeGreaterThan(0)
  })

  it('has no duplicate item IDs', () => {
    const ids = items.map((i) => i.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every item has a non-empty validationDomain', () => {
    const missing = items.filter((i) => !i.validationDomain?.trim())
    expect(missing.map((i) => i.id)).toEqual([])
  })

  it('every item has a confidence score between 0 and 100', () => {
    const invalid = items.filter((i) => {
      const s = i.confidence?.score
      return s === undefined || s < 0 || s > 100
    })
    expect(invalid.map((i) => i.id)).toEqual([])
  })

  it('every item references a valid categoryId', () => {
    const validCatIds = new Set(categories.map((c) => c.id))
    const invalid = items.filter((i) => !validCatIds.has(i.categoryId))
    expect(invalid.map((i) => i.id)).toEqual([])
  })

  it('every requires[] reference points to an existing item ID', () => {
    const validIds = new Set(items.map((i) => i.id))
    const broken: string[] = []
    for (const item of items) {
      for (const req of item.requires ?? []) {
        if (!validIds.has(req)) broken.push(`${item.id} → requires "${req}" (not found)`)
      }
    }
    expect(broken).toEqual([])
  })

  it('every affects[] reference points to an existing item ID', () => {
    const validIds = new Set(items.map((i) => i.id))
    const broken: string[] = []
    for (const item of items) {
      for (const aff of item.affects ?? []) {
        if (!validIds.has(aff)) broken.push(`${item.id} → affects "${aff}" (not found)`)
      }
    }
    expect(broken).toEqual([])
  })

  it('every item has a non-empty title', () => {
    const missing = items.filter((i) => !i.title?.trim())
    expect(missing.map((i) => i.id)).toEqual([])
  })

  it('every item has a non-empty requirement', () => {
    const missing = items.filter((i) => !i.requirement?.trim())
    expect(missing.map((i) => i.id)).toEqual([])
  })

  it('computeMetrics runs without error on full matrix and returns correct total', () => {
    const metrics = computeMetrics(items, categories)
    expect(metrics.total).toBe(items.length)
    expect(metrics.byCategory.length).toBe(categories.length)
  })
})
