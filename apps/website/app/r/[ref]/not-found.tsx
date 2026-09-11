import { API_ENV } from '@/lib/api';
import { INVALID_PROOF, TrustNote, VerdictHeader, VerifierFrame } from './verifier-parts';

/**
 * A proof reference that definitively does not exist.
 *
 * The same official verifier page and the same red verdict the reader always
 * saw — only now with an HTTP 404 instead of a 200, so a crawler, a link checker
 * or an integrator's HTTP client is not told that a page for a non-existent
 * proof exists. Reached only through notFound() on a definitive answer; an
 * unavailable verifier renders the amber page with its own status, never this.
 */
export default function ProofNotFound() {
  return (
    <VerifierFrame sandbox={API_ENV === 'SANDBOX'}>
      <VerdictHeader tone="red" title={INVALID_PROOF.title} sub={INVALID_PROOF.sub} />
      <TrustNote tone="red" />
    </VerifierFrame>
  );
}
