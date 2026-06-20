// Operator Readiness — derives launch-readiness from the validation matrix.
// The studio's one question: "Can Banzami safely operate real-world payments today?"
//
// Three lenses, all derived from the matrix (status + blockingIssues) — never a
// status change at source:
//   • LAUNCH-READY      = status VALIDATED (production-proven)
//   • CODE-COMPLETE     = status VALIDATED | IMPLEMENTED (internal engineering done)
//   • EXTERNALLY BLOCKED = not VALIDATED, blocked by an external dependency
//                          (vendor / bank / provider / rail / regulator)
//   • INTERNALLY BLOCKED = not VALIDATED, resolvable by internal engineering
//
// Launch-readiness is stricter than implementation-readiness: an IMPLEMENTED item
// that still depends on an external provider (e.g. WAL-004 funding, KYB-001 KYC
// vendor) is code-complete but NOT launch-ready.

import type { ValidationMatrix, ValidationItem, ValidationDomain } from './types'

export type PillarStatus = 'ready' | 'partial' | 'blocked'

export interface PillarReadiness {
  domain: ValidationDomain
  label: string
  question: string
  launchReady: number    // VALIDATED
  codeComplete: number    // VALIDATED | IMPLEMENTED
  total: number
  externallyBlocked: number
  criticalGaps: number    // CRITICAL items not yet VALIDATED
  status: PillarStatus
}

export interface Blocker {
  id: string
  title: string
  status: string
  externallyBlocked: boolean
}

export interface Readiness {
  pillars: PillarReadiness[]
  canLaunch: boolean
  // Launch-ready (strict) — the headline.
  launchReady: number
  total: number
  launchReadyPct: number
  criticalLaunchReady: number
  criticalTotal: number
  // Code-complete (secondary, informational).
  codeComplete: number
  criticalCodeComplete: number
  // Gap explainers.
  externallyBlocked: number
  internallyBlocked: number
  // Launch-critical gaps (CRITICAL not VALIDATED).
  blockers: Blocker[]
}

// External blocker markers — a non-validated item whose blockingIssues mention a
// vendor, bank, provider, rail, or regulator is blocked by something outside our
// engineering, not by missing internal code.
const EXTERNAL_RE =
  /PROVIDER_REQUIRED|RAIL_REQUIRED|RECONCILIATION_REQUIRED|VENDOR_REQUIRED|vendor|provider|parceiro|partner|EMIS|BNA|banco|bank|\brail\b|certifica/i

export function isLaunchReady(i: ValidationItem): boolean {
  return i.status === 'VALIDATED'
}

export function isCodeComplete(i: ValidationItem): boolean {
  return i.status === 'VALIDATED' || i.status === 'IMPLEMENTED'
}

export function isExternallyBlocked(i: ValidationItem): boolean {
  return i.status !== 'VALIDATED' && (i.blockingIssues ?? []).some((b) => EXTERNAL_RE.test(b))
}

export function isInternallyBlocked(i: ValidationItem): boolean {
  return i.status !== 'VALIDATED' && !isExternallyBlocked(i)
}

// Per-item readiness lens for badges. An IMPLEMENTED item with an external blocker
// reads as 'externally-blocked', not 'implemented'.
export type ItemLens = 'validated' | 'implemented' | 'externally-blocked' | 'internally-blocked'

export function itemLens(i: ValidationItem): ItemLens {
  if (i.status === 'VALIDATED') return 'validated'
  if (isExternallyBlocked(i)) return 'externally-blocked'
  if (i.status === 'IMPLEMENTED') return 'implemented'
  return 'internally-blocked'
}

// Each pillar answers one launch question.
const PILLARS: { domain: ValidationDomain; label: string; question: string }[] = [
  { domain: 'DOM-MONEY-MOVE', label: 'Money Movement',  question: 'Can money move between wallets?' },
  { domain: 'DOM-MONEY-IN',   label: 'Money In',         question: 'Can real Kwanza enter the system through at least one approved provider or banking rail?' },
  { domain: 'DOM-MONEY-OUT',  label: 'Money Out',        question: 'Can money leave the system to a bank account or external rail through at least one approved provider?' },
  { domain: 'DOM-IDENTITY',   label: 'Identity',         question: 'Can consumers use wallets & @handles?' },
  { domain: 'DOM-MERCHANT',   label: 'Merchant',         question: 'Can merchants accept & manage payments?' },
  { domain: 'DOM-DEVELOPER',  label: 'Developer',        question: 'Can developers integrate safely?' },
  { domain: 'DOM-LEDGER',     label: 'Ledger',           question: 'Is the money provably correct?' },
  { domain: 'DOM-TRUST',      label: 'Trust & Compliance', question: 'Is it safe & auditable for regulators?' },
  { domain: 'DOM-OPERATIONS', label: 'Operations',       question: 'Can incidents be detected & handled?' },
  { domain: 'DOM-CONFORMANCE', label: 'Protocol Conformance', question: 'Can Banzami prove BANZA L0 sandbox conformance with official protocol tooling? (evidence, not certification)' },
]

export function computeReadiness(matrix: ValidationMatrix): Readiness {
  const items = matrix.items

  const pillars: PillarReadiness[] = PILLARS.map(({ domain, label, question }) => {
    const its = items.filter((i) => i.validationDomain === domain)
    const launchReady = its.filter(isLaunchReady).length
    const codeComplete = its.filter(isCodeComplete).length
    const externallyBlocked = its.filter(isExternallyBlocked).length
    const criticalGaps = its.filter((i) => i.priority === 'CRITICAL' && !isLaunchReady(i)).length
    let status: PillarStatus = 'partial'
    if (launchReady === its.length && its.length > 0) status = 'ready'
    else if (criticalGaps > 0 || externallyBlocked > 0) status = 'blocked'
    return { domain, label, question, launchReady, codeComplete, total: its.length, externallyBlocked, criticalGaps, status }
  })

  const criticals = items.filter((i) => i.priority === 'CRITICAL')
  const criticalLaunchReady = criticals.filter(isLaunchReady).length
  const criticalCodeComplete = criticals.filter(isCodeComplete).length
  const blockers: Blocker[] = criticals
    .filter((i) => !isLaunchReady(i))
    .map((i) => ({ id: i.id, title: i.title, status: i.status, externallyBlocked: isExternallyBlocked(i) }))

  const launchReady = items.filter(isLaunchReady).length
  const codeComplete = items.filter(isCodeComplete).length

  return {
    pillars,
    canLaunch: criticalLaunchReady === criticals.length,
    launchReady,
    total: items.length,
    launchReadyPct: items.length ? Math.round((launchReady / items.length) * 100) : 0,
    criticalLaunchReady,
    criticalTotal: criticals.length,
    codeComplete,
    criticalCodeComplete,
    externallyBlocked: items.filter(isExternallyBlocked).length,
    internallyBlocked: items.filter(isInternallyBlocked).length,
    blockers,
  }
}
