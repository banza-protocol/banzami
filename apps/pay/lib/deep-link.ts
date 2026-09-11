/**
 * The custom-scheme link that opens the Banzami app from this page.
 *
 * Every page here emitted `banzami://…` whatever stack it was serving, and the
 * app refuses a link of the other environment — rightly, since a page of the
 * Sandbox must never start a real payment. The effect was that "Abrir no
 * Banzami" on the Sandbox payer surface did nothing at all, and on a Live build
 * a Sandbox page's button would have opened a real-money payment prefilled from
 * test data (A8-11).
 *
 * The scheme is the environment's: `banzami-sandbox` for SANDBOX, `banzami` for
 * LIVE — the same two names the SDK emits (sdk/flutter qr_scheme.dart). When
 * the environment is not known, no scheme is guessed and the caller shows no
 * app link rather than the wrong one.
 */
import { serverEnvironment, type ServerEnvironment } from './server-environment';

export const LIVE_SCHEME = 'banzami';
export const SANDBOX_SCHEME = 'banzami-sandbox';

export function schemeFor(environment: ServerEnvironment | null): string | null {
  if (environment === 'SANDBOX') return SANDBOX_SCHEME;
  if (environment === 'LIVE') return LIVE_SCHEME;
  return null;
}

/**
 * Builds `<scheme>://<path>` for this deployment, or null when the environment
 * is unknown. `path` is everything after the scheme, e.g. `pay/u/fm65`.
 */
export function deepLink(path: string, environment: ServerEnvironment | null = serverEnvironment()): string | null {
  const scheme = schemeFor(environment);
  if (scheme === null) return null;
  return `${scheme}://${path.replace(/^\/+/, '')}`;
}
