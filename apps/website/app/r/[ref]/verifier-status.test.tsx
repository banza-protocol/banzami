import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProofResult } from '@/lib/api';

/**
 * What the public verifier ANSWERS — the status code as much as the page.
 *
 * Four states, one lookup, one decision:
 *   exists    → 200
 *   no such   → 404 (with the same Portuguese invalid-proof page)
 *   malformed → 404
 *   outage    → 503   ← never a 200 that says "indisponível"
 *   limited   → 429
 *
 * An outage served on a 200 tells every machine that reads it that we answered.
 * These assert we do not say that.
 */

const getProof = vi.fn<(ref: string) => Promise<ProofResult>>();
const platformTarget = vi.fn(async () => ({ base: 'https://sandbox-api.test', env: 'SANDBOX' as 'LIVE' | 'SANDBOX' }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, getProof: (ref: string) => getProof(ref), platformTarget: () => platformTarget() };
});

const { GET } = await import('./route');
const { proofDefinitivelyAbsent, proofHttpStatus } = await import('@/lib/proof-view');

const REF = 'BZM-5EED-0A11';

// The edge sets the reader's address; the handler reads it off the request.
const request = () => new Request('https://banzami.com/r/' + REF, { headers: { 'x-real-ip': '198.51.100.7' } });
const run = (ref = REF) => GET(request(), { params: Promise.resolve({ ref }) });

beforeEach(() => { getProof.mockReset(); });

describe('verifier HTTP status', () => {
  it('a proof the verifier says does not exist is a 404', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'NOT_FOUND' });
    const res = await run();
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Comprovativo inválido');
  });

  it('a malformed reference is a 404', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'INVALID_REFERENCE' });
    expect((await run('bzm-5eed-0a11')).status).toBe(404);
  });

  for (const status of ['UNAVAILABLE', 'ERROR']) {
    it(`${status} is a 503 — an outage of ours, never the receipt's fault`, async () => {
      getProof.mockResolvedValue({ exists: false, status, message: 'x' });
      const res = await run();
      expect(res.status).toBe(503);
      const html = await res.text();
      expect(html).toContain('Verificação indisponível');
      // Amber, never an accusation: our outage may not call a genuine receipt forged.
      expect(html).not.toMatch(/falsificad/);
    });
  }

  it('a rate-limited reader is a 429, not an outage and not a verdict', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'RATE_LIMITED' });
    const res = await run();
    expect(res.status).toBe(429);
    const html = await res.text();
    expect(html).toContain('Verificação indisponível');
    expect(html).not.toMatch(/falsificad/);
  });

  it('an existing proof is a 200', async () => {
    getProof.mockResolvedValue({ exists: true, status: 'CONFIRMED', amount: 500000, currency: 'AOA', operation_kind: 'PAYMENT' });
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Pagamento verificado');
  });

  // Whatever the state, the answer is about one reader's reference, read live.
  it('no state is cacheable or indexable', async () => {
    for (const p of [
      { exists: true, status: 'CONFIRMED', amount: 1, currency: 'AOA' },
      { exists: false, status: 'NOT_FOUND' },
      { exists: false, status: 'UNAVAILABLE' },
      { exists: false, status: 'RATE_LIMITED' },
    ] as ProofResult[]) {
      getProof.mockResolvedValue(p);
      const res = await run();
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('x-robots-tag')).toContain('noindex');
    }
  });

  it('asks the verifier exactly once per reference', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'UNAVAILABLE' });
    await run();
    expect(getProof).toHaveBeenCalledTimes(1);
  });

  it('the 404 page is the same Portuguese invalid-proof view', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'NOT_FOUND' });
    const html = await (await run()).text();
    expect(html).toContain('Comprovativo inválido');
    expect(html).toContain('VERIFICAÇÃO OFICIAL');
    expect(html).toContain('Fonte da verdade');
    expect(html).toContain('Verificar outro comprovativo');
  });

  // The Sandbox disclosure is the proof's environment — the stack it was read
  // from — not the build-time API host.
  it('the Sandbox banner follows the proof, not the build', async () => {
    const proof = { exists: true, status: 'CONFIRMED', amount: 500000, currency: 'AOA', operation_kind: 'PAYMENT' };
    getProof.mockResolvedValue({ ...proof, environment: 'SANDBOX' });
    expect(await (await run()).text()).toContain('SANDBOX · sem valor financeiro real');
    getProof.mockResolvedValue({ ...proof, environment: 'LIVE' });
    expect(await (await run()).text()).not.toContain('SANDBOX');
  });

  // One date format per page: "Verificado agora" uses the same clock and shape
  // as "Confirmado em" — dd/mm/yyyy, hh:mm (WAT).
  it('shows every time in one format', async () => {
    getProof.mockResolvedValue({ exists: true, status: 'CONFIRMED', amount: 500000, currency: 'AOA', confirmed_at: '2026-09-10T19:13:00Z' });
    const html = await (await run()).text();
    expect(html).toContain('10/09/2026, 20:13 (WAT)');
    const stamps = html.match(/\d{2}\/\d{2}\/\d{2,4},? \d{2}:\d{2}[^<]*/g) ?? [];
    expect(stamps.length).toBeGreaterThanOrEqual(2);
    for (const s of stamps) expect(s).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} \(WAT\)/);
  });

  // The decision itself, stated once and directly.
  it('one decision maps every answer to its status', () => {
    expect(proofHttpStatus({ exists: true, status: 'CONFIRMED' })).toBe(200);
    expect(proofHttpStatus({ exists: true, status: 'REVERSED' })).toBe(200);
    expect(proofHttpStatus({ exists: false, status: 'NOT_FOUND' })).toBe(404);
    expect(proofHttpStatus({ exists: false, status: 'INVALID_REFERENCE' })).toBe(404);
    expect(proofHttpStatus({ exists: false, status: 'UNAVAILABLE' })).toBe(503);
    expect(proofHttpStatus({ exists: false, status: 'ERROR' })).toBe(503);
    expect(proofHttpStatus({ exists: false, status: 'RATE_LIMITED' })).toBe(429);
  });

  it('only a definitive answer is "absent"', () => {
    expect(proofDefinitivelyAbsent({ exists: false, status: 'NOT_FOUND' })).toBe(true);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'INVALID_REFERENCE' })).toBe(true);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'UNAVAILABLE' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'ERROR' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'RATE_LIMITED' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: true, status: 'REVERSED' })).toBe(false);
  });
});
