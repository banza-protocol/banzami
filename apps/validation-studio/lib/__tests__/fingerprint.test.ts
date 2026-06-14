import { describe, it, expect } from 'vitest'
import { computeFingerprint, verifyFingerprint } from '@/lib/fingerprint'
import type { FingerprintInput } from '@/lib/fingerprint'
import type { ValidationItem } from '@/lib/types'

// ─── Fixture factories ─────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    id: 'DOC-004',
    title: 'Plataforma de validação',
    categoryId: 'cat-sandbox',
    validationDomain: 'DOM-OPS',
    referenceSection: '§17',
    description: 'Governance infrastructure',
    requirement: 'Must govern validation lifecycle',
    status: 'IMPLEMENTED',
    priority: 'HIGH',
    ownerArea: 'Engineering',
    technicalArea: 'TypeScript',
    validationMethods: ['production_review'],
    acceptanceCriteria: ['Matrix JSON parseable', 'Studio runs locally'],
    testCoverage: false,
    evidence: [{ type: 'route', label: '/validacao page', ref: 'apps/validation-studio/app/studio/validation/page.tsx' }],
    dependencies: [],
    requires: [],
    affects: [],
    revalidateWhenChanged: [],
    blockingIssues: [],
    invariants: [],
    confidence: { score: 65, level: 'HIGH', basis: [] },
    history: [],
    lastUpdated: '2026-05-20',
    ...overrides,
  }
}

function makeInput(overrides: Partial<FingerprintInput> = {}): FingerprintInput {
  return {
    item: makeItem(),
    gitDiff: 'diff --git a/apps/validation-studio/app/studio/validation/page.tsx',
    proposedPatch: { status: 'VALIDATED' },
    ...overrides,
  }
}

// ─── computeFingerprint — determinism ─────────────────────────────────────────

describe('computeFingerprint — determinism', () => {
  it('produces the same fingerprint for identical inputs called twice', () => {
    const input = makeInput()
    expect(computeFingerprint(input)).toBe(computeFingerprint(input))
  })

  it('produces the same fingerprint for structurally equal inputs (different object references)', () => {
    const a = makeInput()
    const b = makeInput()
    expect(computeFingerprint(a)).toBe(computeFingerprint(b))
  })

  it('produces the same fingerprint regardless of call order', () => {
    const input = makeInput()
    const fp1 = computeFingerprint(input)
    const fp2 = computeFingerprint(input)
    const fp3 = computeFingerprint(input)
    expect(fp1).toBe(fp2)
    expect(fp2).toBe(fp3)
  })
})

// ─── computeFingerprint — output format ───────────────────────────────────────

describe('computeFingerprint — output format', () => {
  it('returns exactly 16 characters', () => {
    expect(computeFingerprint(makeInput())).toHaveLength(16)
  })

  it('returns only lowercase hex characters', () => {
    const fp = computeFingerprint(makeInput())
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns 16 hex chars for an input with empty gitDiff', () => {
    const fp = computeFingerprint(makeInput({ gitDiff: '' }))
    expect(fp).toHaveLength(16)
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })
})

// ─── computeFingerprint — sensitivity to proposedPatch.status ─────────────────

describe('computeFingerprint — sensitivity to proposedPatch.status', () => {
  it('changes when proposedPatch.status changes from VALIDATED to IMPLEMENTED', () => {
    const a = makeInput({ proposedPatch: { status: 'VALIDATED' } })
    const b = makeInput({ proposedPatch: { status: 'IMPLEMENTED' } })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })

  it('changes when proposedPatch.status changes from IMPLEMENTED to IN_PROGRESS', () => {
    const a = makeInput({ proposedPatch: { status: 'IMPLEMENTED' } })
    const b = makeInput({ proposedPatch: { status: 'IN_PROGRESS' } })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })
})

// ─── computeFingerprint — sensitivity to evidence ─────────────────────────────

describe('computeFingerprint — sensitivity to evidence', () => {
  it('changes when evidence is added to the item', () => {
    const withEvidence = makeInput({
      item: makeItem({
        evidence: [
          { type: 'route', label: '/validacao', ref: 'apps/validation-studio/app/studio/validation/page.tsx' },
          { type: 'test', label: 'governance.test.ts', ref: 'apps/validation-studio/lib/__tests__/governance.test.ts' },
        ],
      }),
    })
    const withoutEvidence = makeInput({ item: makeItem({ evidence: [] }) })
    expect(computeFingerprint(withEvidence)).not.toBe(computeFingerprint(withoutEvidence))
  })

  it('changes when evidence is removed from the item', () => {
    const full = makeInput()
    const empty = makeInput({ item: makeItem({ evidence: [] }) })
    expect(computeFingerprint(full)).not.toBe(computeFingerprint(empty))
  })

  it('changes when proposedPatch.evidence changes', () => {
    const a = makeInput({ proposedPatch: { status: 'VALIDATED', evidence: [] } })
    const b = makeInput({
      proposedPatch: {
        status: 'VALIDATED',
        evidence: [{ type: 'route', label: '/validacao', ref: 'apps/validation-studio/app/studio/validation/page.tsx' }],
      },
    })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })
})

// ─── computeFingerprint — sensitivity to gitDiff ──────────────────────────────

describe('computeFingerprint — sensitivity to gitDiff', () => {
  it('changes when gitDiff changes', () => {
    const a = makeInput({ gitDiff: 'diff --git a/file.ts b/file.ts\n+new line' })
    const b = makeInput({ gitDiff: 'diff --git a/file.ts b/file.ts\n+different line' })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })

  it('changes when gitDiff is empty vs non-empty', () => {
    const a = makeInput({ gitDiff: '' })
    const b = makeInput({ gitDiff: 'diff --git a/apps/validation-studio/app/studio/validation/page.tsx' })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })
})

// ─── computeFingerprint — sensitivity to item.status ─────────────────────────

describe('computeFingerprint — sensitivity to item.status', () => {
  it('changes when the current item status changes', () => {
    const a = makeInput({ item: makeItem({ status: 'IMPLEMENTED' }) })
    const b = makeInput({ item: makeItem({ status: 'IN_PROGRESS' }) })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })
})

// ─── computeFingerprint — sensitivity to item.requires ────────────────────────

describe('computeFingerprint — sensitivity to item.requires', () => {
  it('changes when requires list changes', () => {
    const a = makeInput({ item: makeItem({ requires: [] }) })
    const b = makeInput({ item: makeItem({ requires: ['DOC-001'] }) })
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b))
  })
})

// ─── verifyFingerprint ────────────────────────────────────────────────────────

describe('verifyFingerprint', () => {
  it('returns true when recomputed fingerprint matches proposal fingerprint', () => {
    const input = makeInput()
    const fp = computeFingerprint(input)
    expect(verifyFingerprint(fp, input)).toBe(true)
  })

  it('returns false when status changes after proposal was generated', () => {
    const proposalInput = makeInput({ proposedPatch: { status: 'VALIDATED' } })
    const proposalFp = computeFingerprint(proposalInput)
    const driftedInput = makeInput({ proposedPatch: { status: 'IMPLEMENTED' } })
    expect(verifyFingerprint(proposalFp, driftedInput)).toBe(false)
  })

  it('returns false when gitDiff changes after proposal (implementation drifted)', () => {
    const proposalInput = makeInput({ gitDiff: 'diff --git a/original.ts' })
    const proposalFp = computeFingerprint(proposalInput)
    const driftedInput = makeInput({ gitDiff: 'diff --git a/changed.ts' })
    expect(verifyFingerprint(proposalFp, driftedInput)).toBe(false)
  })

  it('returns false when evidence changes between proposal and apply', () => {
    const proposalInput = makeInput({ item: makeItem({ evidence: [] }) })
    const proposalFp = computeFingerprint(proposalInput)
    const driftedInput = makeInput({
      item: makeItem({
        evidence: [{ type: 'route', label: 'extra', ref: 'apps/validation-studio/app/page.tsx' }],
      }),
    })
    expect(verifyFingerprint(proposalFp, driftedInput)).toBe(false)
  })

  it('returns true for identical input regardless of object reference', () => {
    const fp = computeFingerprint(makeInput())
    expect(verifyFingerprint(fp, makeInput())).toBe(true)
  })

  it('returns false for a fabricated fingerprint string', () => {
    const input = makeInput()
    expect(verifyFingerprint('0000000000000000', input)).toBe(false)
  })
})
