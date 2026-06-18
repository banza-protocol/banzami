// Operator Readiness — derives launch-readiness from the validation matrix.
// The studio's one question: "Can Banzami safely operate real-world payments today?"

import type { ValidationMatrix, ValidationItem, ValidationDomain } from './types'

export type PillarStatus = 'ready' | 'partial' | 'blocked'

export interface PillarReadiness {
  domain: ValidationDomain
  label: string
  question: string
  ready: number          // VALIDATED | IMPLEMENTED
  total: number
  criticalGaps: number   // CRITICAL items not yet ready (incl. BLOCKED)
  blocked: number        // items with status BLOCKED
  status: PillarStatus
}

export interface Readiness {
  pillars: PillarReadiness[]
  canLaunch: boolean
  criticalTotal: number
  criticalReady: number
  blockers: { id: string; title: string; status: string }[]
  readyPct: number
}

const READY = new Set(['VALIDATED', 'IMPLEMENTED'])

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
]

export function computeReadiness(matrix: ValidationMatrix): Readiness {
  const items = matrix.items

  const pillars: PillarReadiness[] = PILLARS.map(({ domain, label, question }) => {
    const its = items.filter((i) => i.validationDomain === domain)
    const ready = its.filter((i) => READY.has(i.status)).length
    const blocked = its.filter((i) => i.status === 'BLOCKED').length
    const criticalGaps = its.filter((i) => i.priority === 'CRITICAL' && !READY.has(i.status)).length
    let status: PillarStatus = 'partial'
    if (criticalGaps === 0 && ready === its.length && its.length > 0) status = 'ready'
    else if (criticalGaps > 0 || blocked > 0) status = 'blocked'
    return { domain, label, question, ready, total: its.length, criticalGaps, blocked, status }
  })

  const criticals = items.filter((i) => i.priority === 'CRITICAL')
  const criticalReady = criticals.filter((i) => READY.has(i.status)).length
  const blockers = criticals
    .filter((i) => !READY.has(i.status))
    .map((i) => ({ id: i.id, title: i.title, status: i.status }))

  return {
    pillars,
    canLaunch: blockers.length === 0,
    criticalTotal: criticals.length,
    criticalReady,
    blockers,
    readyPct: items.length ? Math.round((items.filter((i) => READY.has(i.status)).length / items.length) * 100) : 0,
  }
}
