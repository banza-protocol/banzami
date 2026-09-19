/**
 * A balance you could not read is not a balance of zero.
 *
 * proof 06 did this:
 *
 *     const before = await home.readBalance();        // → null
 *     await waitForBalance(home, (before ?? 0) + 100, 25000);
 *
 * readBalance() returns null when no Kz amount is rendered yet. The `?? 0`
 * turned that failed measurement into a target of 100 Kz — and the consumer it
 * was watching had just registered, so it held the automatic 1 000 000 minor
 * Sandbox grant and showed 10 000 Kz. The target could never be met, the 25 s
 * elapsed, and two realtime gates reported "B did not update within 25s": a
 * product accusation manufactured from a missing reading.
 *
 * It is the same shape as every other defect this programme has found — a null
 * becoming a plausible number — and it is the one that makes the test lie
 * about the product rather than about itself.
 */

export class BalanceBaselineUnavailable extends Error {
  constructor(label, timeoutMs, attempts) {
    super(`BALANCE_BASELINE_UNAVAILABLE: ${label} showed no readable balance within ${timeoutMs} ms (${attempts} attempts)`);
    this.name = 'BalanceBaselineUnavailable';
    this.code = 'BALANCE_BASELINE_UNAVAILABLE';
    this.label = label;
  }
}

/**
 * Poll until the UI shows a balance, and return it. Never returns a default.
 *
 * `read` is anything that resolves to a number or to null/undefined. The caller
 * gets a number or an exception — there is deliberately no third outcome, so
 * no call site can reintroduce a fallback by forgetting to check.
 */
export async function requireBalanceBaseline(read, { label = 'home', timeoutMs = 20_000, everyMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    // try/catch, not .catch(): a read() that throws SYNCHRONOUSLY never
    // reaches Promise.resolve(), and the exception would escape past the very
    // guard this function is.
    let v = null;
    try { v = await read(); } catch { v = null; }
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new BalanceBaselineUnavailable(label, timeoutMs, attempts);
}
