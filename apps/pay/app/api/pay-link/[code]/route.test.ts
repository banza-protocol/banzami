import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * A2-28: the environment of a payment request comes from the server, never
 * from the URL.
 *
 * The route read `?sandbox=1` to decide both which backend to ask and what to
 * call the answer. Anyone could append it to a link on the Live server and get
 * a request labelled SANDBOX — or drop it on the Sandbox server and get LIVE.
 * The environment is now the server's own configuration: PAY_ENVIRONMENT, or
 * the gateway it is built against.
 */
const getConsumerPayLink = vi.fn();
vi.mock('@/lib/api', () => ({ getConsumerPayLink: (...a: unknown[]) => getConsumerPayLink(...a) }));

const LINK = { code: 'abc', status: 'ACTIVE', amount_minor: 50000, currency: 'AOA', receiver_handle: 'ana' };

async function call(query = '') {
  const { GET } = await import('./route');
  const req = new NextRequest(`https://pay.banzami.com/api/pay-link/abc${query}`);
  const res = await GET(req, { params: Promise.resolve({ code: 'abc' }) });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  getConsumerPayLink.mockReset();
  getConsumerPayLink.mockResolvedValue(LINK);
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/pay-link/[code] — environment', () => {
  it('a Live server answers LIVE and asks the Live backend, whatever the URL says', async () => {
    vi.stubEnv('PAY_ENVIRONMENT', 'LIVE');
    const r = await call('?sandbox=1');
    expect(r.status).toBe(200);
    expect(r.body.environment).toBe('LIVE');
    expect(getConsumerPayLink).toHaveBeenCalledWith('abc', false);
  });

  it('a Sandbox server answers SANDBOX and asks the Sandbox backend without being told', async () => {
    vi.stubEnv('PAY_ENVIRONMENT', 'SANDBOX');
    const r = await call();
    expect(r.body.environment).toBe('SANDBOX');
    expect(getConsumerPayLink).toHaveBeenCalledWith('abc', true);
  });

  it('with no PAY_ENVIRONMENT, the gateway the server is built against decides', async () => {
    vi.stubEnv('PAY_ENVIRONMENT', '');
    vi.stubEnv('NEXT_PUBLIC_GATEWAY_URL', 'https://sandbox-api.banzami.com');
    expect((await call()).body.environment).toBe('SANDBOX');
    vi.stubEnv('NEXT_PUBLIC_GATEWAY_URL', 'https://api.banzami.com');
    expect((await call('?sandbox=1')).body.environment).toBe('LIVE');
  });

  it('an environment the server cannot name is refused, never guessed', async () => {
    vi.stubEnv('PAY_ENVIRONMENT', '');
    vi.stubEnv('NEXT_PUBLIC_GATEWAY_URL', 'http://localhost:8080');
    const r = await call('?sandbox=1');
    expect(r.status).toBe(503);
    expect(r.body.environment).toBeUndefined();
    expect(getConsumerPayLink).not.toHaveBeenCalled();

    vi.stubEnv('PAY_ENVIRONMENT', 'staging');
    expect((await call()).status).toBe(503);
  });
});
