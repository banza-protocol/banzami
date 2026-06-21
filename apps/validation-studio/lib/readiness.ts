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
  launchReady: number    // VALIDATED (excludes baseline pointers)
  codeComplete: number    // VALIDATED | IMPLEMENTED (excludes baseline pointers)
  total: number
  roadmap: number         // FUTURE | PLANNED — tracked future scope, not launch surface
  baseline: number        // display-only baseline pointers (excluded from launch math)
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
  total: number          // every tracked item (incl. roadmap + baseline)
  launchScope: number    // total − roadmap − baseline: the current launch surface
  roadmap: number        // FUTURE | PLANNED: tracked future scope, not a blocker
  baseline: number       // display-only baseline pointers (e.g. L0 in the roadmap)
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
  // BANZA conformance level path (L0→L4), display-only — derived from the matrix,
  // never affects launch math.
  banzaLevels: BanzaLevel[]
}

// BANZA operator conformance levels, shown as a top-level L0→L4 progression strip.
// Status is derived from the matrix items, never hard-coded:
//   validated → an item for that level is VALIDATED (L0 evidence/baseline)
//   planned   → PLANNED roadmap item (L1)
//   future    → FUTURE roadmap item (L2–L4)
export type BanzaLevelStatus = 'validated' | 'planned' | 'future'

export interface BanzaLevel {
  level: string        // 'L0' … 'L4'
  label: string        // 'BANZA L0'
  status: BanzaLevelStatus
  state: string        // display badge: 'VALIDATED' | 'PLANNED' | 'FUTURE'
  subtitle: string
  note: string         // small print — always evidence/roadmap framing, never a cert claim
}

const BANZA_LEVEL_META: { level: string; label: string; subtitle: string; note: string }[] = [
  { level: 'L0', label: 'BANZA L0', subtitle: 'Sandbox conformance evidence validated', note: 'evidence, not certification' },
  { level: 'L1', label: 'BANZA L1', subtitle: 'Core Payments roadmap',                  note: 'gap analysis required' },
  { level: 'L2', label: 'BANZA L2', subtitle: 'Payment Initiation roadmap',             note: 'evidence not generated' },
  { level: 'L3', label: 'BANZA L3', subtitle: 'Federation roadmap',                     note: 'M2/M3 + CA-gated' },
  { level: 'L4', label: 'BANZA L4', subtitle: 'External interoperability',              note: 'profile-defined' },
]

export function banzaLevels(items: ValidationItem[]): BanzaLevel[] {
  return BANZA_LEVEL_META.map((meta) => {
    const levelItems = items.filter(
      (i) => i.validationDomain === 'DOM-CONFORMANCE' && i.id.startsWith(`BANZA-${meta.level}-`),
    )
    const status: BanzaLevelStatus = levelItems.some((i) => i.status === 'VALIDATED')
      ? 'validated'
      : levelItems.some((i) => i.status === 'PLANNED')
        ? 'planned'
        : 'future'
    const state = status === 'validated' ? 'VALIDATED' : status === 'planned' ? 'PLANNED' : 'FUTURE'
    return { ...meta, status, state }
  })
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

// Roadmap items are tracked future scope (FUTURE | PLANNED) — e.g. the BANZA
// L1–L4 conformance progression. They are intentionally outside the current
// launch surface: never launch-ready, never code-complete, and never counted as
// an internal or external blocker. Tracking them must not make launch look worse.
export function isRoadmap(i: ValidationItem): boolean {
  return i.status === 'FUTURE' || i.status === 'PLANNED'
}

// Baseline pointers (e.g. the L0 baseline shown inside the BANZA Level Roadmap)
// summarise an already-tracked achieved level. The evidence they reference is
// already counted elsewhere (Protocol Conformance), so a baseline is display-only
// and excluded from ALL launch math — it never inflates launch-ready/code-complete
// and is never a blocker, regardless of its own status.
export function isBaseline(i: ValidationItem): boolean {
  return i.roadmapBaseline === true
}

export function isInternallyBlocked(i: ValidationItem): boolean {
  return i.status !== 'VALIDATED' && !isExternallyBlocked(i) && !isRoadmap(i) && !isBaseline(i)
}

// Per-item readiness lens for badges. An IMPLEMENTED item with an external blocker
// reads as 'externally-blocked', not 'implemented'.
export type ItemLens = 'validated' | 'implemented' | 'roadmap' | 'externally-blocked' | 'internally-blocked'

export function itemLens(i: ValidationItem): ItemLens {
  if (i.status === 'VALIDATED') return 'validated'
  if (isExternallyBlocked(i)) return 'externally-blocked'
  if (i.status === 'IMPLEMENTED') return 'implemented'
  if (isRoadmap(i)) return 'roadmap'
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
    const roadmap = its.filter(isRoadmap).length
    const baseline = its.filter(isBaseline).length
    const launchScope = its.length - roadmap - baseline // items expected to be launch-ready
    const launchReady = its.filter((i) => isLaunchReady(i) && !isBaseline(i)).length
    const codeComplete = its.filter((i) => isCodeComplete(i) && !isBaseline(i)).length
    const externallyBlocked = its.filter(isExternallyBlocked).length
    const criticalGaps = its.filter((i) => i.priority === 'CRITICAL' && !isLaunchReady(i)).length
    // 'ready' = every launch-surface item validated (roadmap/baseline don't block it).
    let status: PillarStatus = 'partial'
    if (launchScope > 0 && launchReady === launchScope) status = 'ready'
    else if (criticalGaps > 0 || externallyBlocked > 0) status = 'blocked'
    return { domain, label, question, launchReady, codeComplete, total: its.length, roadmap, baseline, externallyBlocked, criticalGaps, status }
  })

  const criticals = items.filter((i) => i.priority === 'CRITICAL')
  const criticalLaunchReady = criticals.filter(isLaunchReady).length
  const criticalCodeComplete = criticals.filter(isCodeComplete).length
  const blockers: Blocker[] = criticals
    .filter((i) => !isLaunchReady(i))
    .map((i) => ({ id: i.id, title: i.title, status: i.status, externallyBlocked: isExternallyBlocked(i) }))

  const launchReady = items.filter((i) => isLaunchReady(i) && !isBaseline(i)).length
  const codeComplete = items.filter((i) => isCodeComplete(i) && !isBaseline(i)).length
  const roadmap = items.filter(isRoadmap).length
  const baseline = items.filter(isBaseline).length
  const launchScope = items.length - roadmap - baseline

  return {
    pillars,
    canLaunch: criticalLaunchReady === criticals.length,
    launchReady,
    total: items.length,
    launchScope,
    roadmap,
    baseline,
    launchReadyPct: launchScope ? Math.round((launchReady / launchScope) * 100) : 0,
    criticalLaunchReady,
    criticalTotal: criticals.length,
    codeComplete,
    criticalCodeComplete,
    externallyBlocked: items.filter(isExternallyBlocked).length,
    internallyBlocked: items.filter(isInternallyBlocked).length,
    blockers,
    banzaLevels: banzaLevels(items),
  }
}
