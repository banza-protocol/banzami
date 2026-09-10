// @vitest-environment jsdom
/**
 * An outage must never accuse a receipt of being forged.
 *
 * The backend already answers 200 / 404 / 503 / 500 distinctly. The client was
 * collapsing every non-verified outcome into "exists: false", and the page
 * rendered that as "Comprovativo inválido — não existe ou pode ter sido
 * falsificado". So a genuine receipt was called a probable forgery whenever the
 * verifier was merely unwell — and unparseable bodies, which is exactly what the
 * fail-closed LIVE rail returns, took the same path.
 *
 * Three outcomes: VERIFIED, definitive INVALID/NOT_FOUND, and UNAVAILABLE.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformTarget = vi.fn();
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return actual;
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  platformTarget.mockResolvedValue({ base: 'https://sandbox-api.test' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jsonResponse = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;
const brokenBody = (status: number) =>
  ({ status, json: async () => { throw new SyntaxError('Unexpected token <'); } }) as unknown as Response;

async function getProof(ref: string) {
  const mod = await import('./api');
  return mod.getProof(ref);
}

describe('public proof verification states', () => {
  it('200 with a proof is VERIFIED', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', amount: 1000000 }));
    const r = await getProof('BZM-F993-38E2');
    expect(r.exists).toBe(true);
    expect(r.status).toBe('CONFIRMED');
  });

  it('404 is a definitive NOT_FOUND — the only case that may accuse', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { exists: false, status: 'NOT_FOUND', message: 'não existe' }));
    const r = await getProof('BZM-0000-0000');
    expect(r.exists).toBe(false);
    expect(r.status).toBe('NOT_FOUND');
  });

  for (const status of [500, 502, 503, 504]) {
    it(`${status} is UNAVAILABLE, not invalid`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(status, { exists: false, status: 'ERROR' }));
      const r = await getProof('BZM-F993-38E2');
      expect(r.status).toBe('UNAVAILABLE');
      expect(r.message).not.toMatch(/falsificad/i);
    });
  }

  // The deployed failure: the fail-closed rail answered 503 with an HTML page.
  it('an unparseable body is UNAVAILABLE, not NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(brokenBody(200));
    const r = await getProof('BZM-F993-38E2');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('unparseable_response');
    expect(r.message).not.toMatch(/falsificad/i);
  });

  it('a body of the wrong shape is UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { totally: 'unexpected' }));
    const r = await getProof('BZM-F993-38E2');
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('a network failure is UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await getProof('BZM-F993-38E2');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('network_error');
  });

  it('never renders forgery language for any non-definitive outcome', async () => {
    const cases = [brokenBody(200), jsonResponse(503, {}), jsonResponse(500, {})];
    for (const c of cases) {
      fetchMock.mockResolvedValue(c);
      const r = await getProof('BZM-F993-38E2');
      expect(r.message ?? '').not.toMatch(/falsificad|inválido/i);
    }
  });
});
