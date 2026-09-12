import { describe, it, expect } from 'vitest'
import {
  computeReadiness,
  isLaunchReady,
  isCodeComplete,
  isExternallyBlocked,
  isInternallyBlocked,
  isRoadmap,
  isBaseline,
  itemLens,
  banzaLevels,
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

  it('roadmap items (FUTURE/PLANNED) are tracked but never blockers', () => {
    for (const status of ['FUTURE', 'PLANNED'] as const) {
      const r = item({ id: status, status, validationDomain: 'DOM-CONFORMANCE' })
      expect(isRoadmap(r)).toBe(true)
      expect(isLaunchReady(r)).toBe(false)
      expect(isCodeComplete(r)).toBe(false)
      expect(isExternallyBlocked(r)).toBe(false)
      expect(isInternallyBlocked(r)).toBe(false) // key: roadmap is not an internal blocker
      expect(itemLens(r)).toBe('roadmap')
    }
    // VALIDATED/IMPLEMENTED are not roadmap.
    expect(isRoadmap(item({ id: 'V', status: 'VALIDATED' }))).toBe(false)
    expect(isRoadmap(item({ id: 'P', status: 'IN_PROGRESS' }))).toBe(false)
  })

  it('a baseline pointer is display-only: never inflates launch math, never a blocker', () => {
    const base = item({ id: 'BASE', status: 'IMPLEMENTED', roadmapBaseline: true, validationDomain: 'DOM-CONFORMANCE' })
    expect(isBaseline(base)).toBe(true)
    expect(isInternallyBlocked(base)).toBe(false) // excluded even though IMPLEMENTED
    expect(isExternallyBlocked(base)).toBe(false)

    const r = computeReadiness(
      matrix([
        item({ id: 'V', status: 'VALIDATED', priority: 'CRITICAL' }),
        item({ id: 'BASE-V', status: 'VALIDATED', roadmapBaseline: true }), // even VALIDATED baseline
        item({ id: 'BASE-I', status: 'IMPLEMENTED', roadmapBaseline: true }),
      ]),
    )
    expect(r.total).toBe(3)
    expect(r.baseline).toBe(2)
    expect(r.launchScope).toBe(1)        // only 'V' is launch surface
    expect(r.launchReady).toBe(1)        // baseline VALIDATED is NOT counted
    expect(r.codeComplete).toBe(1)       // baseline IMPLEMENTED is NOT counted
    expect(r.internallyBlocked).toBe(0)
    expect(r.canLaunch).toBe(true)
  })

  it('roadmap items do not dilute launch scope or add blockers', () => {
    const r = computeReadiness(
      matrix([
        item({ id: 'V', status: 'VALIDATED', priority: 'CRITICAL' }),
        item({ id: 'R1', status: 'FUTURE', priority: 'HIGH' }),
        item({ id: 'R2', status: 'PLANNED', priority: 'MEDIUM' }),
      ]),
    )
    expect(r.total).toBe(3)
    expect(r.roadmap).toBe(2)
    expect(r.launchScope).toBe(1)
    expect(r.launchReady).toBe(1)
    expect(r.launchReadyPct).toBe(100) // 1/1 launch scope, roadmap excluded
    expect(r.internallyBlocked).toBe(0)
    expect(r.externallyBlocked).toBe(0)
    expect(r.canLaunch).toBe(true)
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

  it('launch-ready is 63/74 launch scope, with 10 roadmap + 1 baseline + 2 retired tracked', () => {
    // 87 tracked items = 74 launch-scope + 10 BANZA L1–L4 roadmap (FUTURE/PLANNED)
    // + 1 L0 baseline pointer + 2 retired. Roadmap, baseline and retired are all
    // excluded from the launch scope, so tracking them cannot make launch look
    // worse — which is what happened when the merchant dashboard was withdrawn
    // and its two items landed in "blocked on internal engineering".
    expect(r.total).toBe(87)
    expect(r.roadmap).toBe(10)
    expect(r.baseline).toBe(1)
    expect(r.retired).toBe(2)
    expect(r.launchScope).toBe(74)
    expect(r.launchReady).toBe(63)
    expect(r.codeComplete).toBe(65)
  })

  it('launch-critical is 19/24 and implemented-critical is 21/24', () => {
    // Roadmap items are HIGH/MEDIUM/LOW (never CRITICAL), so launch-critical is unchanged.
    expect(r.criticalTotal).toBe(24)
    expect(r.criticalLaunchReady).toBe(19)
    expect(r.criticalCodeComplete).toBe(21)
  })

  it('10 items are externally blocked and 1 is blocked on internal engineering', () => {
    expect(r.externallyBlocked).toBe(10)
    // Roadmap items (FUTURE/PLANNED) and retired items are never internal
    // blockers. The one that is: BW-004, whose per-member access log has no read
    // surface — developer.audit_events is written and nothing serves it.
    expect(r.internallyBlocked).toBe(1)
  })

  it('BANZA level path reads L0 validated → L1 planned → L2/L3/L4 future', () => {
    const levels = banzaLevels(readMatrix().items)
    expect(levels.map((l) => l.level)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4'])
    const byLevel = Object.fromEntries(levels.map((l) => [l.level, l.status]))
    expect(byLevel.L0).toBe('validated')
    expect(byLevel.L1).toBe('planned')
    expect(byLevel.L2).toBe('future')
    expect(byLevel.L3).toBe('future')
    expect(byLevel.L4).toBe('future')
    // Display-only: no level above L0 is validated.
    expect(levels.filter((l) => l.status === 'validated').map((l) => l.level)).toEqual(['L0'])
    // Guardrail note framing, never a certification claim.
    expect(levels.find((l) => l.level === 'L0')!.note).toBe('evidence, not certification')
    expect(levels.find((l) => l.level === 'L3')!.note).toBe('M2/M3 + CA-gated')
  })

  it('Protocol Conformance pillar is 10/10 validated (L0) with 10 roadmap + 1 baseline', () => {
    const conf = r.pillars.find((p) => p.domain === 'DOM-CONFORMANCE')!
    expect(conf.total).toBe(21)          // 10 L0 evidence + 10 L1–L4 roadmap + 1 L0 baseline
    expect(conf.roadmap).toBe(10)
    expect(conf.baseline).toBe(1)
    expect(conf.launchReady).toBe(10)    // all 10 launch-surface (L0) items validated
    expect(conf.total - conf.roadmap - conf.baseline).toBe(10) // launch scope
    expect(conf.externallyBlocked).toBe(0)
    expect(conf.status).toBe('ready')    // launch surface fully validated
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
