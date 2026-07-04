/**
 * @banzami/sdk/sandbox — the curated EXTERNAL Sandbox surface (ADR-046, RT02).
 *
 * This entrypoint re-exports ONLY methods backed by a capability the assurance
 * manifest marks `released`. Today that is identity resolution via
 * `BanzamiClient.me()` plus configuration/error/environment helpers. Methods for
 * pending-e2e capabilities (payment sessions, links, QR, refunds, payouts,
 * webhooks) are intentionally NOT surfaced here — an external Sandbox developer
 * gets only what is verified against the deployed Gateway.
 *
 * The full `@banzami/sdk` index remains for internal/vendored use; external
 * developers should import from `@banzami/sdk/sandbox`.
 *
 * Enforced by tools/check-sdk-contract.mjs.
 */

export { BanzamiClient } from './client.js';
export { BanzamiApiError, BanzamiConfigError, BanzamiAuthError } from './errors.js';
export { environmentFromKey, resolveEnvironment } from './client.js';
export type { BanzamiEnvironment } from './types.js';

// Released capability surface (external Sandbox):
//   new BanzamiClient({ apiKey: 'bz_test_sk_...' }).me()
// No payment/refund/payout/session/link/QR/webhook methods are exported here.
