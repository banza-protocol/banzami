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

const getProof = vi.fn<(ref: string) => Promise<ProofResult>>();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, getProof: (ref: string) => getProof(ref) };
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

  it('an existing proof renders, with no 404', async () => {
    getProof.mockResolvedValue({ exists: true, status: 'CONFIRMED', amount: 500000, currency: 'AOA', operation_kind: 'PAYMENT' });
    const html = renderToStaticMarkup(await run());
    expect(notFound).not.toHaveBeenCalled();
    expect(html).toContain('Pagamento verificado');
  });

  it('the 404 page is the same Portuguese invalid-proof view', () => {
    const html = renderToStaticMarkup(<ProofNotFound />);
    expect(html).toContain('Comprovativo inválido');
    expect(html).toContain('VERIFICAÇÃO OFICIAL');
    expect(html).toContain('Fonte da verdade');
    expect(html).toContain('Verificar outro comprovativo');
  });

  it('only a definitive answer is "absent"', () => {
    expect(proofDefinitivelyAbsent({ exists: false, status: 'NOT_FOUND' })).toBe(true);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'INVALID_REFERENCE' })).toBe(true);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'UNAVAILABLE' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: false, status: 'ERROR' })).toBe(false);
    expect(proofDefinitivelyAbsent({ exists: true, status: 'REVERSED' })).toBe(false);
  });
});
