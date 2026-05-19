import crypto from 'crypto'
import type { ValidationItem } from './types'

export interface FingerprintInput {
  item: ValidationItem
  gitDiff: string
  proposedPatch: Partial<ValidationItem>
}

/**
 * Compute a deterministic 16-char hex fingerprint from the proposal state.
 * Guarantees: the same item + diff + patch always produce the same fingerprint.
 * A fingerprint mismatch between proposal and apply time means the implementation drifted.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const canonical = JSON.stringify({
    itemId: input.item.id,
    itemStatus: input.item.status,
    itemEvidence: input.item.evidence,
    itemAcceptanceCriteria: input.item.acceptanceCriteria,
    itemInvariants: input.item.invariants,
    itemRequires: input.item.requires,
    gitDiff: input.gitDiff,
    proposedStatus: input.proposedPatch.status,
    proposedEvidence: input.proposedPatch.evidence,
    proposedInvariants: input.proposedPatch.invariants,
  })
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Verify that the recomputed fingerprint matches the proposal fingerprint.
 * Returns true if the implementation state is unchanged since proposal generation.
 */
export function verifyFingerprint(
  proposalFingerprint: string,
  currentInput: FingerprintInput,
): boolean {
  return computeFingerprint(currentInput) === proposalFingerprint
}
