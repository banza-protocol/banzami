/**
 * The Business activation page may only call a link invalid when the gateway
 * said so. validateActivation returned res.json() whatever the status, so a 503
 * or a 429 — a body with no `valid` — read as invalid, and an owner holding a
 * good link was told "Este link de ativação é inválido".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateActivation } from '@/lib/api';
import { phaseFor, unavailableCopy } from './ActivarFlow';

let fetchMock: ReturnType<typeof vi.fn>;
const jsonResponse = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Every request answers `res`, the platform-mode probe included (it fails to SANDBOX). */
async function validateWith(res: Response) {
  fetchMock.mockResolvedValue(res);
  return validateActivation('tok');
}

describe('activation link states', () => {
  it('a valid link is valid', async () => {
    const r = await validateWith(jsonResponse(200, { valid: true, reason: 'VALID', business_name: 'Doa', handle: 'doa' }));
    expect(phaseFor(r)).toEqual({ kind: 'valid', businessName: 'Doa', handle: 'doa' });
  });

  it('the gateway saying invalid, expired or used is a verdict', async () => {
    expect(phaseFor(await validateWith(jsonResponse(200, { valid: false, reason: 'INVALID' }))).kind).toBe('invalid');
    expect(phaseFor(await validateWith(jsonResponse(200, { valid: false, reason: 'EXPIRED' }))).kind).toBe('expired');
    expect(phaseFor(await validateWith(jsonResponse(200, { valid: false, reason: 'USED' }))).kind).toBe('used');
    expect(phaseFor(await validateWith(jsonResponse(400, { code: 'VALIDATION_ERROR' }))).kind).toBe('invalid');
  });

  for (const status of [500, 502, 503]) {
    it(`${status} is unavailable, never invalid`, async () => {
      const phase = phaseFor(await validateWith(jsonResponse(status, { error: { code: 'UNAVAILABLE' } })));
      expect(phase.kind).toBe('unavailable');
    });
  }

  it('429 is rate-limited, never invalid', async () => {
    expect(phaseFor(await validateWith(jsonResponse(429, { error: { code: 'RATE_LIMITED' } }))).kind).toBe('rate_limited');
  });

  it('an unreadable 200 is unavailable', async () => {
    expect(phaseFor(await validateWith(jsonResponse(200, { unexpected: true }))).kind).toBe('unavailable');
  });

  it('only a verdict says "inválido"; the others offer a retry', () => {
    for (const k of ['unavailable', 'rate_limited', 'network'] as const) {
      const c = unavailableCopy(k);
      expect(c.message).not.toMatch(/inválid/);
      expect(c.retry).toBe(true);
    }
    expect(unavailableCopy('invalid').message).toMatch(/inválido/);
    expect(unavailableCopy('invalid').retry).toBe(false);
  });
});
