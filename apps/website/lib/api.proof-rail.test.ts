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
  let modeRail: 'answers' | 'fail-closed' = 'answers';

  beforeEach(() => {
    calls.length = 0;
    modeRail = 'answers';
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/v1/platform-mode')) {
        if (modeRail === 'fail-closed') {
          // What the LIVE rail actually does while the platform is SANDBOX.
          return new Response('<!doctype html><html>503</html>', { status: 503 });
        }
        return new Response(JSON.stringify({ mode: 'SANDBOX', public_banner: true }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
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
    const r = await getProof('BZM-5EED-0A11');

    const proofCall = calls.find(c => c.includes('/v1/public/proofs/'));
    expect(proofCall, 'no proof lookup was made').toBeDefined();
    expect(proofCall).toContain('https://sandbox-api.banzami.com');
    expect(proofCall).not.toContain('https://api.banzami.com/v1/public/proofs');
    expect(r.exists).toBe(true);
  });

  // A2-17: a mode that cannot be read is not SANDBOX. The page used to assume
  // it and ask the Sandbox stack — while the platform may be LIVE, where a
  // genuine proof would then come back "not found". Unknown is UNAVAILABLE.
  it('an unreadable platform mode is UNAVAILABLE — no stack is guessed, nothing looks forged', async () => {
    modeRail = 'fail-closed';
    const { getProof } = await import('./api');
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('platform_mode_unknown');
    expect(calls.some(c => c.includes('/v1/public/proofs/'))).toBe(false);
    expect(r.message ?? '').not.toContain('falsificado');
  });
});
