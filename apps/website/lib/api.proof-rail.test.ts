import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A proof must be looked up on the stack that can answer it.
 *
 * getProof was pinned to API_BASE, which defaults to the LIVE rail. While the
 * platform is SANDBOX that rail is fail-closed and answers 503 with an HTML
 * page, so json() threw and the page reported a genuine Sandbox reference as
 * one that "does not exist or may have been forged". A verification surface
 * calling a real ledger record a forgery is a correctness defect, not a
 * degraded experience.
 */
describe('getProof resolves its rail from Platform Mode', () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/v1/platform-mode')) {
        // What the LIVE rail actually does while the platform is SANDBOX.
        return new Response('<!doctype html><html>503</html>', { status: 503 });
      }
      if (u.includes('/v1/public/proofs/')) {
        return new Response(
          JSON.stringify({ exists: true, status: 'CONFIRMED', reference: 'BZM-TEST' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks the Sandbox rail, not the fail-closed LIVE one', async () => {
    const { getProof } = await import('./api');
    const r = await getProof('BZM-TEST');

    const proofCall = calls.find(c => c.includes('/v1/public/proofs/'));
    expect(proofCall, 'no proof lookup was made').toBeDefined();
    expect(proofCall).toContain('https://sandbox-api.banzami.com');
    expect(proofCall).not.toContain('https://api.banzami.com/v1/public/proofs');
    expect(r.exists).toBe(true);
  });

  it('a fail-closed LIVE platform-mode response does not make a real proof look forged', async () => {
    const { getProof } = await import('./api');
    const r = await getProof('BZM-TEST');
    expect(r.status).not.toBe('NOT_FOUND');
    expect(r.message ?? '').not.toContain('falsificado');
  });
});
