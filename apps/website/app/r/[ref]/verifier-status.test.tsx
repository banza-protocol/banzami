import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProofResult } from '@/lib/api';

/**
 * A reference that definitively does not exist answers HTTP 404 — with the same
 * Portuguese invalid-proof page — instead of a 200 that says "inválido". An
 * unavailable verifier is never a 404: it keeps its amber page.
 */

const NOT_FOUND = new Error('NEXT_NOT_FOUND');
const notFound = vi.fn(() => { throw NOT_FOUND; });
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
// The page reads the reader's address from its request (A9-08); a request scope
// exists only inside Next, so the test supplies the headers the edge would set.
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': '198.51.100.7' }) }));

const getProof = vi.fn<(ref: string) => Promise<ProofResult>>();
const platformTarget = vi.fn(async () => ({ base: 'https://sandbox-api.test', env: 'SANDBOX' as 'LIVE' | 'SANDBOX' }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, getProof: (ref: string) => getProof(ref), platformTarget: () => platformTarget() };
});

const { default: ProofPage } = await import('./page');
const { default: ProofNotFound } = await import('./not-found');
const { proofDefinitivelyAbsent } = await import('@/lib/proof-view');

const REF = 'BZM-5EED-0A11';
const run = (ref = REF) => ProofPage({ params: Promise.resolve({ ref }) });

beforeEach(() => { notFound.mockClear(); getProof.mockReset(); });

describe('verifier HTTP status', () => {
  it('a proof the verifier says does not exist is a 404', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'NOT_FOUND' });
    await expect(run()).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('a malformed reference is a 404', async () => {
    getProof.mockResolvedValue({ exists: false, status: 'INVALID_REFERENCE' });
    await expect(run('bzm-5eed-0a11')).rejects.toBe(NOT_FOUND);
  });

  for (const status of ['UNAVAILABLE', 'ERROR']) {
    it(`${status} is never a 404 — it stays "Verificação indisponível"`, async () => {
      getProof.mockResolvedValue({ exists: false, status, message: 'x' });
      const page = await run();
      expect(notFound).not.toHaveBeenCalled();
      const html = renderToStaticMarkup(page);
      expect(html).toContain('Verificação indisponível');
      expect(html).not.toMatch(/falsificad/);
    });
  }

  // An outage must not be cacheable or indexable, which is the harm the status
  // code would otherwise guard against.
  //
  // The four states asked for are: exists → 200, missing → 404, malformed →
  // 404, outage → 503. The first three hold above. The fourth does not, and it
  // cannot from here: a Next App Router PAGE has no way to set a response
  // status — notFound() is the only one it can reach — and getting a 503 would
  // mean repeating the proof lookup in middleware to decide it, which is two
  // answers to the same question. That is the failure this codebase refuses
  // everywhere else, including in the decision not to give the Console a second
  // way to resolve a QR.
  //
  // So the reader gets the truthful amber verdict on a 200 that no cache may
  // keep and no crawler may index. That is what these assert, so the property
  // survives even though the status does not.
  it('an outage page is uncacheable and unindexable', async () => {
    const meta = await import('./page');
    // robots: index false — declared in the page's metadata, for every state.
    expect(meta.metadata?.robots).toMatchObject({ index: false });
    // force-dynamic: rendered per request, so no shared cache holds it.
    expect(meta.dynamic).toBe('force-dynamic');
  });

  it('an existing proof renders, with no 404', async () => {
    getProof.mockResolvedValue({ exists: true, status: 'CONFIRMED', amount: 500000, currency: 'AOA', operation_kind: 'PAYMENT' });
    const html = renderToStaticMarkup(await run());
    expect(notFound).not.toHaveBeenCalled();
    expect(html).toContain('Pagamento verificado');
  });

  it('the 404 page is the same Portuguese invalid-proof view', async () => {
    const html = renderToStaticMarkup(await ProofNotFound());
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
    expect(renderToStaticMarkup(await run())).toContain('SANDBOX · sem valor financeiro real');
    getProof.mockResolvedValue({ ...proof, environment: 'LIVE' });
    expect(renderToStaticMarkup(await run())).not.toContain('SANDBOX');
  });

  // One date format per page: "Verificado agora" uses the same clock and shape
  // as "Confirmado em" — dd/mm/yyyy, hh:mm (WAT).
  it('shows every time in one format', async () => {
    getProof.mockResolvedValue({ exists: true, status: 'CONFIRMED', amount: 500000, currency: 'AOA', confirmed_at: '2026-09-10T19:13:00Z' });
    const html = renderToStaticMarkup(await run());
    expect(html).toContain('10/09/2026, 20:13 (WAT)');
    const stamps = html.match(/\d{2}\/\d{2}\/\d{2,4},? \d{2}:\d{2}[^<]*/g) ?? [];
    expect(stamps.length).toBeGreaterThanOrEqual(2);
    for (const s of stamps) expect(s).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} \(WAT\)/);
  });

  it('only a definitive answer is "absent"', () => {
    expect(proofDefinitivelyAbsent({ exists: false, status: 'NOT_FOUND' })).toBe(true);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'INVALID_REFERENCE' })).toBe(true);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'UNAVAILABLE' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'ERROR' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: true, status: 'REVERSED' })).toBe(false);
  });
});
