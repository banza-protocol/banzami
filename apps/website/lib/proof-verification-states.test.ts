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
    const r = await getProof('BZM-5EED-0A11');
    expect(r.exists).toBe(true);
    expect(r.status).toBe('CONFIRMED');
  });

  // The payload carries no environment; the proof's is the stack that answered.
  // platform-mode is unreadable here, so the target is the fail-safe SANDBOX.
  it("a proof carries the environment of the stack it was read from", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', amount: 1000000 }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.environment).toBe('SANDBOX');
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
      const r = await getProof('BZM-5EED-0A11');
      expect(r.status).toBe('UNAVAILABLE');
      expect(r.message).not.toMatch(/falsificad/i);
    });
  }

  // The deployed failure: the fail-closed rail answered 503 with an HTML page.
  it('an unparseable body is UNAVAILABLE, not NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(brokenBody(200));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('unparseable_response');
    expect(r.message).not.toMatch(/falsificad/i);
  });

  it('a body of the wrong shape is UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { totally: 'unexpected' }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('a network failure is UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('network_error');
  });

  it('never renders forgery language for any non-definitive outcome', async () => {
    const cases = [brokenBody(200), jsonResponse(503, {}), jsonResponse(500, {})];
    for (const c of cases) {
      fetchMock.mockResolvedValue(c);
      const r = await getProof('BZM-5EED-0A11');
      expect(r.message ?? '').not.toMatch(/falsificad|inválido/i);
    }
  });
});

/**
 * An altered reference is never another name for a real proof: the page refuses
 * it definitively and does not even ask the verifier. The reproduced defect was
 * a reference ending BYNO (letter O) resolving to the proof whose
 * reference ends in the digit 0.
 */
describe('getProof: exact reference or nothing', () => {
  const C = 'BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0';
  const aliases = [
    C.slice(0, -1) + 'O', C.toLowerCase(), C + ' ', ' ' + C, C + '\u00A0', C + '\u200B',
    C.replace(/-/g, '\u2013'), C.slice(0, -1) + '\u039F', C.slice(0, -1) + '%30', 'bzm-5eed-0a11',
  ];
  for (const ref of aliases) {
    it(`refuses ${JSON.stringify(ref)} without a request`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED' }));
      const r = await getProof(ref);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(r.exists).toBe(false);
      expect(r.status).toBe('INVALID_REFERENCE');
    });
  }

  it('the canonical reference is asked for, byte for byte', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED' }));
    await getProof(C);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith(`/v1/public/proofs/${C}`))).toBe(true);
  });
});
