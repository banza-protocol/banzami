/**
 * Safety guards for the Sandbox P2P transfer E2E.
 *
 * These are the hard invariants that keep the transfer E2E from ever touching
 * production money, live wallets, or a non-Sandbox host. They are pure (no I/O)
 * so they can be unit-tested and are asserted by the runner BEFORE any request.
 *
 * The canonical path under test is the wallet-native consumer P2P transfer:
 *   consumer JWT → public-api POST /v1/transfers (recipient = @banza handle)
 *   → core send_p2p → TransferEngine (atomic double-entry, idempotent, COMPLETED).
 */

/** Prefix stamped on every test handle the fixture registers, so audit is trivial. */
export const E2E_HANDLE_PREFIX = 'e2e';

/** Never move more than a nominal test amount (500,000 minor = 5,000 Kz). */
export const MAX_NOMINAL_MINOR = 500_000;

/** The fixture is inert unless the operator opts in explicitly. */
export function assertExplicitRun(flag) {
  if (flag !== 'RUN') {
    throw new Error('Transfer E2E is inert. Set BANZAMI_E2E=RUN to execute it deliberately.');
  }
}

/**
 * The base URL MUST be a Sandbox consumer host. A live host (api.banzami.com
 * without "sandbox") — or anything not clearly Sandbox — aborts before any
 * request. This is the primary money-safety boundary.
 */
export function assertSandboxConsumerBase(baseUrl) {
  const url = String(baseUrl || '');
  if (!/sandbox/i.test(url)) {
    throw new Error(`Transfer E2E refuses a non-Sandbox base URL: ${url || '<empty>'}`);
  }
  if (/\blive\b/i.test(url)) {
    throw new Error(`Transfer E2E refuses a URL that looks live: ${url}`);
  }
  if (!/\/consumer(\/|$)/.test(url)) {
    throw new Error(`Transfer E2E expects the consumer surface (…/consumer): ${url}`);
  }
}

/** Every registered account MUST be a clearly-tagged E2E test handle. */
export function assertTestHandle(handle) {
  if (!String(handle).startsWith(E2E_HANDLE_PREFIX)) {
    throw new Error(`Transfer E2E only registers "${E2E_HANDLE_PREFIX}…"-tagged handles; got "${handle}".`);
  }
}

/** Only positive, nominal amounts are ever sent (never a large sum). */
export function assertNominalAmount(amountMinor) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error(`Transfer E2E amount must be a positive integer minor value; got ${amountMinor}.`);
  }
  if (amountMinor > MAX_NOMINAL_MINOR) {
    throw new Error(`Transfer E2E refuses a non-nominal amount ${amountMinor} > ${MAX_NOMINAL_MINOR}.`);
  }
}
