import { getProof, platformTarget } from '@/lib/api';
import { readerIpFrom } from '@/lib/proof-reader';
import { proofHttpStatus } from '@/lib/proof-view';
import { verifierResponse } from '@/lib/verifier-response';
import { InvalidProofView, ProofView } from './verifier-view';

/**
 * The public proof verifier — /r/{ref}.
 *
 * A Route Handler rather than a page, for one reason: the status code is part
 * of what this surface asserts. "We could not verify" served on a 200 tells
 * every machine that reads it — a crawler, an uptime monitor, a link checker, an
 * integrator's HTTP client — that we answered, when our verifier was down. A
 * page in the App Router cannot set a status other than 404, and deciding it in
 * middleware instead would mean asking the verifier twice about the same
 * reference: two answers to one question, which is the failure this codebase
 * refuses everywhere else.
 *
 * So the lookup happens once, here, and its outcome decides the status and the
 * view together (lib/proof-view.ts: proofHttpStatus):
 *
 *   200  a proof that exists — confirmed, pending or reversed
 *   404  no such proof, or a reference not spelled as one
 *   503  our verifier could not be reached or read
 *   429  we declined to verify for this reader right now
 *
 * The views themselves are unchanged and shared (verifier-view.tsx); this file
 * decides, it does not present.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }): Promise<Response> {
  const { ref } = await ctx.params;
  // Looked up on the reader's behalf: the gateway limits per reader (A9-08).
  // This is the ONE lookup — nothing else on this path asks again.
  const p = await getProof(ref, readerIpFrom(req.headers));
  const status = proofHttpStatus(p);

  if (status === 404) {
    // A proof that does not exist has no environment of its own; the Sandbox
    // disclosure says which stack was asked.
    const { env } = await platformTarget();
    return verifierResponse(<InvalidProofView sandbox={env === 'SANDBOX'} />, 404);
  }
  return verifierResponse(<ProofView p={p} reference={ref} />, status);
}
