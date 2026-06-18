import { describe, it, expect } from 'vitest'
import {
  computeReadiness,
  isLaunchReady,
  isCodeComplete,
  isExternallyBlocked,
  isInternallyBlocked,
  itemLens,
} from '@/lib/readiness'
import { readMatrix } from '@/lib/matrix'
import type { ValidationItem, ValidationMatrix } from '@/lib/types'

// Minimal item — the readiness model only reads id/status/priority/domain/blockingIssues.
function item(p: Partial<ValidationItem> & { id: string }): ValidationItem {
  return {
    status: 'PLANNED',
    priority: 'MEDIUM',
    validationDomain: 'DOM-MONEY-IN',
    blockingIssues: [],
    title: p.id,
    ...p,
  } as ValidationItem
}

function matrix(items: ValidationItem[]): ValidationMatrix {
  return { items } as ValidationMatrix
}

// ─── Lens logic (stable, synthetic) ────────────────────────────────────────

describe('readiness lenses', () => {
  it('launch-ready counts only VALIDATED', () => {
    expect(isLaunchReady(item({ id: 'A', status: 'VALIDATED' }))).toBe(true)
    expect(isLaunchReady(item({ id: 'B', status: 'IMPLEMENTED' }))).toBe(false)
    expect(isLaunchReady(item({ id: 'C', status: 'IN_PROGRESS' }))).toBe(false)
    expect(isLaunchReady(item({ id: 'D', status: 'BLOCKED' }))).toBe(false)
  })

  it('code-complete counts VALIDATED + IMPLEMENTED', () => {
    expect(isCodeComplete(item({ id: 'A', status: 'VALIDATED' }))).toBe(true)
    expect(isCodeComplete(item({ id: 'B', status: 'IMPLEMENTED' }))).toBe(true)
    expect(isCodeComplete(item({ id: 'C', status: 'IN_PROGRESS' }))).toBe(false)
    expect(isCodeComplete(item({ id: 'D', status: 'BLOCKED' }))).toBe(false)
  })

  it('external-blocked detects vendor/bank/provider/rail/BNA blockers', () => {
    const cases = [
      'FUNDING_PROVIDER_REQUIRED: …',
      'WITHDRAWAL_PROVIDER_REQUIRED: …',
      'SETTLEMENT_RAIL_REQUIRED: …',
      'KYB_IDENTITY_VENDOR_REQUIRED: …',
      'Decisão de parceiro KYC angolano pendente',
      'Certificação BNA pendente',
      'banco parceiro não integrado',
    ]
    for (const b of cases) {
      expect(isExternallyBlocked(item({ id: 'X', status: 'IMPLEMENTED', blockingIssues: [b] }))).toBe(true)
    }
    // A VALIDATED item is never "externally blocked", even with stray text.
    expect(isExternallyBlocked(item({ id: 'V', status: 'VALIDATED', blockingIssues: ['provider'] }))).toBe(false)
    // Non-validated with no external marker → internally blocked, not external.
    const internal = item({ id: 'I', status: 'IN_PROGRESS', blockingIssues: ['needs a unit test'] })
    expect(isExternallyBlocked(internal)).toBe(false)
    expect(isInternallyBlocked(internal)).toBe(true)
  })

  it('an IMPLEMENTED item with an external blocker is code-complete but NOT launch-ready', () => {
    const wal = item({ id: 'WAL-004', status: 'IMPLEMENTED', blockingIssues: ['FUNDING_PROVIDER_REQUIRED: …'] })
    expect(isCodeComplete(wal)).toBe(true)
    expect(isLaunchReady(wal)).toBe(false)
    expect(isExternallyBlocked(wal)).toBe(true)
    expect(itemLens(wal)).toBe('externally-blocked')

    const kyb = item({ id: 'KYB-001', status: 'IMPLEMENTED', blockingIssues: ['KYB_IDENTITY_VENDOR_REQUIRED: …'] })
    expect(isCodeComplete(kyb)).toBe(true)
    expect(isLaunchReady(kyb)).toBe(false)
    expect(itemLens(kyb)).toBe('externally-blocked')

    // A clean IMPLEMENTED item (no external blocker) reads as 'implemented'.
    expect(itemLens(item({ id: 'I', status: 'IMPLEMENTED' }))).toBe('implemented')
    expect(itemLens(item({ id: 'V', status: 'VALIDATED' }))).toBe('validated')
  })

  it('computeReadiness separates launch-ready from code-complete', () => {
    const r = computeReadiness(
      matrix([
        item({ id: 'A', status: 'VALIDATED', priority: 'CRITICAL' }),
        item({ id: 'B', status: 'IMPLEMENTED', priority: 'CRITICAL', blockingIssues: ['FUNDING_PROVIDER_REQUIRED'] }),
        item({ id: 'C', status: 'IN_PROGRESS', priority: 'CRITICAL', blockingIssues: ['parceiro KYC'] }),
      ]),
    )
    expect(r.launchReady).toBe(1)
    expect(r.codeComplete).toBe(2)
    expect(r.criticalLaunchReady).toBe(1)
    expect(r.criticalCodeComplete).toBe(2)
    expect(r.externallyBlocked).toBe(2)
    expect(r.internallyBlocked).toBe(0)
    expect(r.canLaunch).toBe(false)
    expect(r.blockers.map((b) => b.id)).toEqual(['B', 'C']) // both critical, not VALIDATED
  })
})

// ─── Current matrix snapshot (guards the live numbers) ──────────────────────

describe('current matrix readiness snapshot', () => {
  const r = computeReadiness(readMatrix())

  it('launch-ready is 56/66 and code-complete is 58/66', () => {
    expect(r.total).toBe(66)
    expect(r.launchReady).toBe(56)
    expect(r.codeComplete).toBe(58)
  })

  it('launch-critical is 19/24 and implemented-critical is 21/24', () => {
    expect(r.criticalTotal).toBe(24)
    expect(r.criticalLaunchReady).toBe(19)
    expect(r.criticalCodeComplete).toBe(21)
  })

  it('10 items are externally blocked and 0 are blocked on internal engineering', () => {
    expect(r.externallyBlocked).toBe(10)
    expect(r.internallyBlocked).toBe(0)
  })

  it('WAL-004 and KYB-001 are code-complete but not launch-ready', () => {
    const items = readMatrix().items
    for (const id of ['WAL-004', 'KYB-001']) {
      const it = items.find((i) => i.id === id)!
      expect(isCodeComplete(it)).toBe(true)
      expect(isLaunchReady(it)).toBe(false)
      expect(isExternallyBlocked(it)).toBe(true)
    }
  })

  it('Money In is 0/3 launch-ready (was optimistically 1/3) and Trust is 6/9', () => {
    const moneyIn = r.pillars.find((p) => p.domain === 'DOM-MONEY-IN')!
    expect(moneyIn.launchReady).toBe(0)
    expect(moneyIn.codeComplete).toBe(1)
    expect(moneyIn.externallyBlocked).toBe(3)

    const trust = r.pillars.find((p) => p.domain === 'DOM-TRUST')!
    expect(trust.launchReady).toBe(6)
    expect(trust.codeComplete).toBe(7)
  })
})
