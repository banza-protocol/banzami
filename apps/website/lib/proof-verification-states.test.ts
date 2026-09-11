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
// The proof lookup, separate from the platform-mode read that precedes it: the
// verifier only asks a stack once it knows the mode (A2-17).
let proofFetch: ReturnType<typeof vi.fn<(url: unknown) => Promise<Response>>>;
let modeResponse: () => Response;

beforeEach(() => {
  proofFetch = vi.fn<(url: unknown) => Promise<Response>>();
  modeResponse = () => ({ ok: true, status: 200, json: async () => ({ mode: 'SANDBOX', public_banner: true }) }) as unknown as Response;
  fetchMock = vi.fn(async (url: unknown) =>
    String(url).includes('/v1/platform-mode') ? modeResponse() : proofFetch(url));
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
    proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', amount: 1000000 }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.exists).toBe(true);
    expect(r.status).toBe('CONFIRMED');
  });

  // A2-17: the proof's environment comes from the proof, not from which stack
  // the page happened to ask.
  it("a proof carries its own environment from the verifier's payload", async () => {
    proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', amount: 1000000, environment: 'LIVE' }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.environment).toBe('LIVE');
  });

  // A gateway from before the field existed: the stack that answered is the
  // best evidence (each stack holds only its own proofs).
  it('a payload without an environment falls back to the stack that answered', async () => {
    proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', amount: 1000000 }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.environment).toBe('SANDBOX');
  });

  it('a proof whose environment the verifier cannot name is UNAVAILABLE, never labelled', async () => {
    proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', amount: 1000000, environment: null }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('proof_environment_unknown');
  });

  // A2-17: an unreadable platform mode used to become SANDBOX, and the page then
  // asked the Sandbox stack whatever the platform was — so a genuine LIVE proof
  // came back "not found" (red) and a Sandbox one could be read in its place.
  for (const [what, mode] of [
    ['a 503', () => ({ ok: false, status: 503, json: async () => ({ code: 'PLATFORM_MODE_UNAVAILABLE' }) })],
    ['an HTML error page', () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError('<'); } })],
    ['a body with no mode', () => ({ ok: true, status: 200, json: async () => ({}) })],
  ] as const) {
    it(`an unreadable platform mode (${what}) is UNAVAILABLE, and no stack is asked`, async () => {
      modeResponse = mode as unknown as () => Response;
      proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED', environment: 'SANDBOX' }));
      const r = await getProof('BZM-5EED-0A11');
      expect(r.status).toBe('UNAVAILABLE');
      expect(r.unavailable_reason).toBe('platform_mode_unknown');
      expect(r.environment).toBeUndefined();
      expect(proofFetch).not.toHaveBeenCalled();
    });
  }

  it('404 is a definitive NOT_FOUND — the only case that may accuse', async () => {
    proofFetch.mockResolvedValue(jsonResponse(404, { exists: false, status: 'NOT_FOUND', message: 'não existe' }));
    const r = await getProof('BZM-0000-0000');
    expect(r.exists).toBe(false);
    expect(r.status).toBe('NOT_FOUND');
  });

  for (const status of [500, 502, 503, 504]) {
    it(`${status} is UNAVAILABLE, not invalid`, async () => {
      proofFetch.mockResolvedValue(jsonResponse(status, { exists: false, status: 'ERROR' }));
      const r = await getProof('BZM-5EED-0A11');
      expect(r.status).toBe('UNAVAILABLE');
      expect(r.message).not.toMatch(/falsificad/i);
    });
  }

  // The deployed failure: the fail-closed rail answered 503 with an HTML page.
  it('an unparseable body is UNAVAILABLE, not NOT_FOUND', async () => {
    proofFetch.mockResolvedValue(brokenBody(200));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('unparseable_response');
    expect(r.message).not.toMatch(/falsificad/i);
  });

  it('a body of the wrong shape is UNAVAILABLE', async () => {
    proofFetch.mockResolvedValue(jsonResponse(200, { totally: 'unexpected' }));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('a network failure is UNAVAILABLE', async () => {
    proofFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await getProof('BZM-5EED-0A11');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.unavailable_reason).toBe('network_error');
  });

  it('never renders forgery language for any non-definitive outcome', async () => {
    const cases = [brokenBody(200), jsonResponse(503, {}), jsonResponse(500, {})];
    for (const c of cases) {
      proofFetch.mockResolvedValue(c);
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
      proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED' }));
      const r = await getProof(ref);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(r.exists).toBe(false);
      expect(r.status).toBe('INVALID_REFERENCE');
    });
  }

  it('the canonical reference is asked for, byte for byte', async () => {
    proofFetch.mockResolvedValue(jsonResponse(200, { exists: true, status: 'CONFIRMED' }));
    await getProof(C);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith(`/v1/public/proofs/${C}`))).toBe(true);
  });
});
