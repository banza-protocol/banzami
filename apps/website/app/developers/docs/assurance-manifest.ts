// The assurance manifest, typed, for the docs tests.
//
// Badges on the public documentation are not allowed to have an opinion of
// their own: a capability may claim "Disponível em Sandbox" only while the
// manifest records it as released on deployed E2E evidence. Reading the
// manifest here — rather than restating its contents in each test — means the
// badge and the evidence cannot drift apart in either direction: an over-claim
// and a stale under-claim both fail.
import { join } from 'node:path';
import { parseManifest } from '../../../../../tools/assurance-manifest-lib.mjs';

export type Capability = {
  id: string;
  disposition: string;
  status: string;
  surface: string;
  public_status: string;
  evidence: string[];
  tests: { unit: string[]; integration: string[]; e2e_sandbox: string[]; negative_security: string[] };
};

/** Every capability in quality/operator-assurance-manifest.yaml. */
export function capabilities(): Capability[] {
  // Tests run with the website as cwd; the manifest lives at the repo root.
  return parseManifest(join(process.cwd(), '../..')).capabilities as unknown as Capability[];
}

export function capability(id: string): Capability {
  const cap = capabilities().find((c) => c.id === id);
  if (!cap) throw new Error(`capability ${id} is missing from the assurance manifest`);
  return cap;
}

/**
 * True only when the manifest says the capability is released AND carries the
 * deployed evidence that entitles it to say so. Anything less is not released,
 * however the disposition happens to be spelled.
 */
export function isReleased(id: string): boolean {
  const c = capability(id);
  return c.disposition === 'released'
    && c.status === 'verified'
    && c.tests.e2e_sandbox.length > 0
    && c.evidence.length > 0;
}

/** The four capabilities the public docs advertise as cards, in card order. */
export const CARD_CAPABILITIES: { card: string; id: string }[] = [
  { card: 'Criar cobrança', id: 'CAP-PAY-001' },
  { card: 'Transferências', id: 'CAP-TRANSFER-002' },
  { card: 'Webhooks', id: 'CAP-WEBHOOK-001' },
  { card: 'Reembolsos', id: 'CAP-REFUND-001' },
];
