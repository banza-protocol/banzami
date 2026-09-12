import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A limit is not an outage, and an outage is not a verdict.
 *
 * getProof decided the 429 AFTER validating that the body carried `exists`. A
 * 429 carries an error envelope, not a proof, so every rate-limited reader was
 * reported as "unparseable_response" — an outage of ours — and the page answered
 * 503 where it owed a 429. The status is decided on the status line, before the
 * body is read.
 */
describe('getProof separates a limit from an outage', () => {
  let proofStatus = 429;
  let proofBody = JSON.stringify({ error: 'rate_limited' });

  beforeEach(() => {
    vi.resetModules();
    proofStatus = 429;
    proofBody = JSON.stringify({ error: 'rate_limited' });
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/v1/platform-mode')) {
        return new Response(JSON.stringify({ mode: 'SANDBOX' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (u.includes('/v1/public/proofs/')) {
        return new Response(proofBody, { status: proofStatus, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const REF = 'BZM-5EED-0A11';

  it('a 429 whose body carries no proof is RATE_LIMITED, not UNAVAILABLE', async () => {
    const { getProof } = await import('./api');
    const p = await getProof(REF);
    expect(p.status).toBe('RATE_LIMITED');
    expect(p.exists).toBe(false);
    // The reason an outage carries; a limit must not borrow it.
    expect(p.unavailable_reason).toBeUndefined();
  });

  it('the page answers a limit with 429 and an outage with 503', async () => {
    const { getProof } = await import('./api');
    const { proofHttpStatus } = await import('./proof-view');
    expect(proofHttpStatus(await getProof(REF))).toBe(429);

    proofStatus = 502;
    proofBody = '<html>bad gateway</html>';
    expect(proofHttpStatus(await getProof(REF))).toBe(503);
  });

  it('a limit never accuses the receipt', async () => {
    const { getProof } = await import('./api');
    const { proofDefinitivelyAbsent } = await import('./proof-view');
    expect(proofDefinitivelyAbsent(await getProof(REF))).toBe(false);
  });
});
