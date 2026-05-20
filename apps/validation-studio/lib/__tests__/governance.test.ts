import { describe, it, expect } from 'vitest'
import {
  checkItem,
  checkRequires,
  checkInvariants,
  getRequiresBlockers,
  checkMatrix,
  isFinancialCritical,
} from '@/lib/governance'
import {
  computeConfidence,
  VALIDATED_CONFIDENCE_THRESHOLD,
  FINANCIAL_CRITICAL_CATEGORIES,
  confidenceLevelFromScore,
} from '@/lib/types'
import type { ValidationItem, ValidationMatrix, ValidationCategory, ValidationInvariant } from '@/lib/types'

// ─── Fixture factory ──────────────────────────────────────────────────────────

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
    history: [],
    lastUpdated: '2026-05-20',
    ...overrides,
  }
}

function makeInvariant(overrides: Partial<ValidationInvariant> = {}): ValidationInvariant {
  return {
    id: 'INV-LEDGER-001',
    name: 'Double-entry balance',
    rule: 'Debits must equal credits',
    status: 'PASS',
    ...overrides,
  }
}

function makeMatrix(
  items: ValidationItem[],
  categories: ValidationCategory[] = [{ id: 'cat-docs', name: 'Docs', description: '' }],
): ValidationMatrix {
  return {
    meta: { version: '1.0', lastUpdated: '2026-05-20', referenceVersion: '1.0', referenceFile: 'BANZAMI_REFERENCE.md', description: '' },
    categories,
    items,
  }
}

// ─── computeConfidence ────────────────────────────────────────────────────────

describe('computeConfidence', () => {
  it('returns +20 for non-financial item even with no evidence or methods', () => {
    const item = makeItem({ categoryId: 'cat-docs', evidence: [], validationMethods: [] })
    const result = computeConfidence(item)
    expect(result.score).toBe(20)
    expect(result.level).toBe('LOW')
  })

  it('adds +20 when evidence is non-empty', () => {
    const item = makeItem({
      evidence: [{ type: 'route', label: 'page', ref: 'apps/docs/app/page.tsx' }],
    })
    const result = computeConfidence(item)
    expect(result.score).toBeGreaterThanOrEqual(20 + 20)
  })

  it('does NOT double-count evidence — more entries still only +20', () => {
    const oneEntry = makeItem({
      evidence: [{ type: 'route', label: 'a', ref: 'a' }],
    })
    const manyEntries = makeItem({
      evidence: [
        { type: 'route', label: 'a', ref: 'a' },
        { type: 'component', label: 'b', ref: 'b' },
        { type: 'adr', label: 'c', ref: 'c' },
      ],
    })
    expect(computeConfidence(oneEntry).score).toBe(computeConfidence(manyEntries).score)
  })

  it('adds +15 for unit_tests method', () => {
    const without = makeItem({ validationMethods: [] })
    const with_ = makeItem({ validationMethods: ['unit_tests'] })
    expect(computeConfidence(with_).score - computeConfidence(without).score).toBe(15)
  })

  it('adds +20 for integration_tests method', () => {
    const without = makeItem({ validationMethods: [] })
    const with_ = makeItem({ validationMethods: ['integration_tests'] })
    expect(computeConfidence(with_).score - computeConfidence(without).score).toBe(20)
  })

  it('adds +15 for manual_ux method', () => {
    const without = makeItem({ validationMethods: [] })
    const with_ = makeItem({ validationMethods: ['manual_ux'] })
    expect(computeConfidence(with_).score - computeConfidence(without).score).toBe(15)
  })

  it('adds +15 for e2e_tests method (same slot as manual_ux)', () => {
    const without = makeItem({ validationMethods: [] })
    const with_ = makeItem({ validationMethods: ['e2e_tests'] })
    expect(computeConfidence(with_).score - computeConfidence(without).score).toBe(15)
  })

  it('does NOT double-count manual_ux and e2e_tests together', () => {
    const ux = makeItem({ validationMethods: ['manual_ux'] })
    const both = makeItem({ validationMethods: ['manual_ux', 'e2e_tests'] })
    expect(computeConfidence(ux).score).toBe(computeConfidence(both).score)
  })

  it('adds +10 for production_review method', () => {
    const without = makeItem({ validationMethods: [] })
    const with_ = makeItem({ validationMethods: ['production_review'] })
    expect(computeConfidence(with_).score - computeConfidence(without).score).toBe(10)
  })

  it('adds +10 for sandbox method (same slot as production_review)', () => {
    const without = makeItem({ validationMethods: [] })
    const with_ = makeItem({ validationMethods: ['sandbox'] })
    expect(computeConfidence(with_).score - computeConfidence(without).score).toBe(10)
  })

  it('produces exactly 65 for the DOC-004 current method set (non-financial, evidence, manual_ux, production_review)', () => {
    const item = makeItem({
      categoryId: 'cat-docs',
      evidence: [{ type: 'route', label: 'page', ref: 'apps/docs/app/page.tsx' }],
      validationMethods: ['manual_ux', 'production_review'],
    })
    expect(computeConfidence(item).score).toBe(65)
  })

  it('produces exactly 80 for DOC-004 after adding unit_tests', () => {
    const item = makeItem({
      categoryId: 'cat-docs',
      evidence: [{ type: 'route', label: 'page', ref: 'apps/docs/app/page.tsx' }],
      validationMethods: ['unit_tests', 'manual_ux', 'production_review'],
    })
    const result = computeConfidence(item)
    expect(result.score).toBe(80)
    expect(result.level).toBe('VERY_HIGH')
  })

  it('adds +20 for financial item when ALL invariants are PASS', () => {
    const item = makeItem({
      categoryId: 'cat-ledger',
      invariants: [makeInvariant({ status: 'PASS' }), makeInvariant({ id: 'INV-2', name: 'x', rule: 'y', status: 'PASS' })],
    })
    const baseline = makeItem({ categoryId: 'cat-ledger', invariants: [] })
    // Financial item with no invariants: 0 (no +20 since invariants list is empty)
    // Financial item with all PASS: +20
    expect(computeConfidence(item).score - computeConfidence(baseline).score).toBe(20)
  })

  it('does NOT add +20 for financial item when any invariant is FAIL', () => {
    const item = makeItem({
      categoryId: 'cat-ledger',
      invariants: [
        makeInvariant({ status: 'PASS' }),
        makeInvariant({ id: 'INV-2', name: 'x', rule: 'y', status: 'FAIL' }),
      ],
    })
    const result = computeConfidence(item)
    expect(result.basis.some((b) => b.includes('+20'))).toBe(false)
  })

  it('does NOT add +20 for financial item when any invariant is NOT_RUN', () => {
    const item = makeItem({
      categoryId: 'cat-ledger',
      invariants: [makeInvariant({ status: 'NOT_RUN' })],
    })
    const result = computeConfidence(item)
    const withAllPass = makeItem({
      categoryId: 'cat-ledger',
      invariants: [makeInvariant({ status: 'PASS' })],
    })
    expect(computeConfidence(item).score).toBeLessThan(computeConfidence(withAllPass).score)
  })
})

// ─── confidenceLevelFromScore ─────────────────────────────────────────────────

describe('confidenceLevelFromScore', () => {
  it.each([
    [0, 'LOW'],
    [39, 'LOW'],
    [40, 'MEDIUM'],
    [59, 'MEDIUM'],
    [60, 'HIGH'],
    [79, 'HIGH'],
    [80, 'VERY_HIGH'],
    [100, 'VERY_HIGH'],
  ] as const)('score %i → %s', (score, expected) => {
    expect(confidenceLevelFromScore(score)).toBe(expected)
  })

  it('VALIDATED_CONFIDENCE_THRESHOLD is 80', () => {
    expect(VALIDATED_CONFIDENCE_THRESHOLD).toBe(80)
    expect(confidenceLevelFromScore(VALIDATED_CONFIDENCE_THRESHOLD)).toBe('VERY_HIGH')
  })
})

// ─── checkItem — confidence gate ──────────────────────────────────────────────

describe('checkItem — confidence gate', () => {
  it('emits VALIDATED_LOW_CONFIDENCE when VALIDATED and score is 65', () => {
    const item = makeItem({
      status: 'VALIDATED',
      evidence: [{ type: 'route', label: 'page', ref: 'apps/docs/app/page.tsx' }],
      validationMethods: ['manual_ux', 'production_review'],
      // non-financial: score = 20+15+10+20 = 65
    })
    const issues = checkItem(item)
    expect(issues.some((i) => i.rule === 'VALIDATED_LOW_CONFIDENCE')).toBe(true)
  })

  it('does NOT emit VALIDATED_LOW_CONFIDENCE when VALIDATED and score is exactly 80', () => {
    const item = makeItem({
      status: 'VALIDATED',
      evidence: [{ type: 'route', label: 'page', ref: 'apps/docs/app/page.tsx' }],
      validationMethods: ['unit_tests', 'manual_ux', 'production_review'],
      // non-financial: score = 20+15+15+10+20 = 80
    })
    const issues = checkItem(item)
    expect(issues.some((i) => i.rule === 'VALIDATED_LOW_CONFIDENCE')).toBe(false)
  })

  it('does NOT check confidence gate for IMPLEMENTED (not VALIDATED)', () => {
    const item = makeItem({
      status: 'IMPLEMENTED',
      validationMethods: [],
      evidence: [],
    })
    const issues = checkItem(item)
    expect(issues.some((i) => i.rule === 'VALIDATED_LOW_CONFIDENCE')).toBe(false)
  })
})

// ─── checkItem — required fields ──────────────────────────────────────────────

describe('checkItem — required fields', () => {
  it('emits EMPTY_TITLE when title is blank', () => {
    const item = makeItem({ title: '  ' })
    expect(checkItem(item).some((i) => i.rule === 'EMPTY_TITLE')).toBe(true)
  })

  it('emits EMPTY_REQUIREMENT when requirement is blank', () => {
    const item = makeItem({ requirement: '' })
    expect(checkItem(item).some((i) => i.rule === 'EMPTY_REQUIREMENT')).toBe(true)
  })

  it('emits EMPTY_REFERENCE when referenceSection is blank', () => {
    const item = makeItem({ referenceSection: '' })
    expect(checkItem(item).some((i) => i.rule === 'EMPTY_REFERENCE')).toBe(true)
  })

  it('emits MISSING_DOMAIN when validationDomain is missing', () => {
    const item = makeItem({ validationDomain: '' as never })
    expect(checkItem(item).some((i) => i.rule === 'MISSING_DOMAIN')).toBe(true)
  })

  it('emits no field errors for a well-formed PLANNED item', () => {
    const item = makeItem({ status: 'PLANNED' })
    const errors = checkItem(item).filter((i) => i.severity === 'error')
    expect(errors).toHaveLength(0)
  })
})

// ─── checkItem — VALIDATED rules ──────────────────────────────────────────────

describe('checkItem — VALIDATED rules', () => {
  it('emits VALIDATED_NO_EVIDENCE when VALIDATED with empty evidence', () => {
    const item = makeItem({ status: 'VALIDATED', evidence: [] })
    expect(checkItem(item).some((i) => i.rule === 'VALIDATED_NO_EVIDENCE')).toBe(true)
  })

  it('emits BLOCKED_NO_REASON when BLOCKED with empty blockingIssues', () => {
    const item = makeItem({ status: 'BLOCKED', blockingIssues: [] })
    expect(checkItem(item).some((i) => i.rule === 'BLOCKED_NO_REASON')).toBe(true)
  })

  it('does NOT emit BLOCKED_NO_REASON when blockingIssues is populated', () => {
    const item = makeItem({ status: 'BLOCKED', blockingIssues: ['Waiting for EMIS API'] })
    expect(checkItem(item).some((i) => i.rule === 'BLOCKED_NO_REASON')).toBe(false)
  })
})

// ─── checkRequires — architecture lock ───────────────────────────────────────

describe('checkRequires — architecture lock', () => {
  it('emits REQUIRES_NOT_VALIDATED when a required item is IMPLEMENTED', () => {
    const dep = makeItem({ id: 'DEP-001', status: 'IMPLEMENTED' })
    const item = makeItem({ id: 'ITEM-001', status: 'VALIDATED', requires: ['DEP-001'] })
    const issues = checkRequires(item, [item, dep])
    expect(issues.some((i) => i.rule === 'REQUIRES_NOT_VALIDATED')).toBe(true)
  })

  it('emits REQUIRES_NOT_VALIDATED when a required item is PLANNED', () => {
    const dep = makeItem({ id: 'DEP-001', status: 'PLANNED' })
    const item = makeItem({ id: 'ITEM-001', status: 'VALIDATED', requires: ['DEP-001'] })
    expect(checkRequires(item, [item, dep]).some((i) => i.rule === 'REQUIRES_NOT_VALIDATED')).toBe(true)
  })

  it('emits REQUIRES_MISSING when a required ID does not exist in matrix', () => {
    const item = makeItem({ id: 'ITEM-001', status: 'VALIDATED', requires: ['GHOST-999'] })
    const issues = checkRequires(item, [item])
    expect(issues.some((i) => i.rule === 'REQUIRES_MISSING')).toBe(true)
  })

  it('returns no issues when all required items are VALIDATED', () => {
    const dep = makeItem({
      id: 'DEP-001',
      status: 'VALIDATED',
      evidence: [{ type: 'route', label: 'x', ref: 'x' }],
      validationMethods: ['unit_tests', 'manual_ux', 'production_review'],
    })
    const item = makeItem({ id: 'ITEM-001', status: 'VALIDATED', requires: ['DEP-001'] })
    const issues = checkRequires(item, [item, dep])
    expect(issues.filter((i) => i.rule === 'REQUIRES_NOT_VALIDATED')).toHaveLength(0)
    expect(issues.filter((i) => i.rule === 'REQUIRES_MISSING')).toHaveLength(0)
  })

  it('returns no issues when requires[] is empty', () => {
    const item = makeItem({ id: 'ITEM-001', status: 'VALIDATED', requires: [] })
    expect(checkRequires(item, [item])).toHaveLength(0)
  })

  it('does NOT check requires lock for non-VALIDATED items', () => {
    const dep = makeItem({ id: 'DEP-001', status: 'PLANNED' })
    const item = makeItem({ id: 'ITEM-001', status: 'IMPLEMENTED', requires: ['DEP-001'] })
    expect(checkRequires(item, [item, dep])).toHaveLength(0)
  })
})

// ─── getRequiresBlockers ──────────────────────────────────────────────────────

describe('getRequiresBlockers', () => {
  it('returns unvalidated required items', () => {
    const dep = makeItem({ id: 'DEP-001', status: 'PLANNED' })
    const item = makeItem({ id: 'ITEM-001', requires: ['DEP-001'] })
    const blockers = getRequiresBlockers(item, [item, dep])
    expect(blockers).toHaveLength(1)
    expect(blockers[0].id).toBe('DEP-001')
  })

  it('does not return already-validated required items', () => {
    const dep = makeItem({ id: 'DEP-001', status: 'VALIDATED' })
    const item = makeItem({ id: 'ITEM-001', requires: ['DEP-001'] })
    expect(getRequiresBlockers(item, [item, dep])).toHaveLength(0)
  })

  it('returns empty array when requires[] is empty', () => {
    const item = makeItem({ requires: [] })
    expect(getRequiresBlockers(item, [item])).toHaveLength(0)
  })

  it('returns multiple blockers when multiple requires are unvalidated', () => {
    const dep1 = makeItem({ id: 'DEP-001', status: 'PLANNED' })
    const dep2 = makeItem({ id: 'DEP-002', status: 'IMPLEMENTED' })
    const item = makeItem({ id: 'ITEM-001', requires: ['DEP-001', 'DEP-002'] })
    expect(getRequiresBlockers(item, [item, dep1, dep2])).toHaveLength(2)
  })
})

// ─── checkInvariants — financial invariant blocking ───────────────────────────

describe('checkInvariants — financial invariant blocking', () => {
  it('returns no issues for non-financial categories', () => {
    const item = makeItem({
      categoryId: 'cat-docs',
      status: 'VALIDATED',
      invariants: [makeInvariant({ status: 'FAIL' })],
    })
    expect(checkInvariants(item)).toHaveLength(0)
  })

  it('emits INVARIANT_NOT_PASS for financial item with FAIL invariant', () => {
    const item = makeItem({
      categoryId: 'cat-ledger',
      status: 'VALIDATED',
      invariants: [makeInvariant({ status: 'FAIL' })],
    })
    expect(checkInvariants(item).some((i) => i.rule === 'INVARIANT_NOT_PASS')).toBe(true)
  })

  it('emits INVARIANT_NOT_PASS for UNKNOWN invariant status', () => {
    const item = makeItem({
      categoryId: 'cat-wallet',
      status: 'VALIDATED',
      invariants: [makeInvariant({ status: 'UNKNOWN' })],
    })
    expect(checkInvariants(item).some((i) => i.rule === 'INVARIANT_NOT_PASS')).toBe(true)
  })

  it('emits INVARIANT_NOT_PASS for NOT_RUN invariant status', () => {
    const item = makeItem({
      categoryId: 'cat-qr',
      status: 'VALIDATED',
      invariants: [makeInvariant({ status: 'NOT_RUN' })],
    })
    expect(checkInvariants(item).some((i) => i.rule === 'INVARIANT_NOT_PASS')).toBe(true)
  })

  it('returns no issues for financial item with all invariants PASS', () => {
    const item = makeItem({
      categoryId: 'cat-ledger',
      status: 'VALIDATED',
      invariants: [
        makeInvariant({ id: 'INV-1', name: 'a', rule: 'a', status: 'PASS' }),
        makeInvariant({ id: 'INV-2', name: 'b', rule: 'b', status: 'PASS' }),
      ],
    })
    expect(checkInvariants(item)).toHaveLength(0)
  })

  it('emits FINANCIAL_NO_INVARIANTS for financial item with empty invariants when VALIDATED', () => {
    const item = makeItem({
      categoryId: 'cat-ledger',
      status: 'VALIDATED',
      invariants: [],
    })
    expect(checkInvariants(item).some((i) => i.rule === 'FINANCIAL_NO_INVARIANTS')).toBe(true)
  })
})

// ─── FINANCIAL_CRITICAL_CATEGORIES ───────────────────────────────────────────

describe('FINANCIAL_CRITICAL_CATEGORIES', () => {
  it.each(['cat-ledger', 'cat-wallet', 'cat-p2p', 'cat-qr', 'cat-payouts', 'cat-refunds'])(
    '%s is financial-critical',
    (cat) => {
      expect(FINANCIAL_CRITICAL_CATEGORIES.has(cat)).toBe(true)
      expect(isFinancialCritical(cat)).toBe(true)
    },
  )

  it.each(['cat-docs', 'cat-sdk', 'cat-api', 'cat-identity', 'cat-security'])(
    '%s is NOT financial-critical',
    (cat) => {
      expect(FINANCIAL_CRITICAL_CATEGORIES.has(cat)).toBe(false)
      expect(isFinancialCritical(cat)).toBe(false)
    },
  )
})

// ─── checkMatrix — full matrix integrity ─────────────────────────────────────

describe('checkMatrix', () => {
  it('emits DUPLICATE_ID for items with the same ID', () => {
    const a = makeItem({ id: 'DUPE-001' })
    const b = makeItem({ id: 'DUPE-001' })
    const matrix = makeMatrix([a, b])
    const issues = checkMatrix(matrix)
    expect(issues.some((i) => i.rule === 'DUPLICATE_ID')).toBe(true)
  })

  it('emits INVALID_CATEGORY when item references unknown categoryId', () => {
    const item = makeItem({ id: 'ITEM-001', categoryId: 'cat-does-not-exist' })
    const matrix = makeMatrix([item])
    const issues = checkMatrix(matrix)
    expect(issues.some((i) => i.rule === 'INVALID_CATEGORY')).toBe(true)
  })

  it('returns no structural errors for a well-formed matrix', () => {
    const item = makeItem({ id: 'ITEM-001', status: 'PLANNED' })
    const matrix = makeMatrix([item])
    const errors = checkMatrix(matrix).filter((i) => i.severity === 'error')
    expect(errors).toHaveLength(0)
  })

  it('propagates checkItem and checkRequires issues into matrix-level results', () => {
    const dep = makeItem({ id: 'DEP-001', status: 'PLANNED' })
    const item = makeItem({
      id: 'ITEM-001',
      status: 'VALIDATED',
      requires: ['DEP-001'],
      evidence: [{ type: 'route', label: 'x', ref: 'x' }],
      validationMethods: ['unit_tests', 'manual_ux', 'production_review'],
    })
    const matrix = makeMatrix([item, dep])
    const issues = checkMatrix(matrix)
    expect(issues.some((i) => i.rule === 'REQUIRES_NOT_VALIDATED')).toBe(true)
  })
})
