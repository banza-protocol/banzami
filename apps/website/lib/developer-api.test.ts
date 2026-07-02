import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { developerApi, ApiError } from './developer-api';

// Mocked integration tests for the Developer Console API client: credentialed
// requests, CSRF on mutations, session restore, logout, error mapping (401
// recovery basis), and reveal-once key behavior. No real network.

type Cap = { url: string; init: RequestInit };

function mockFetch(status: number, body: unknown, cap?: (c: Cap) => void) {
  return vi.fn(async (url: string, init: RequestInit) => {
    cap?.({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  });
}

function headers(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('developer-api client', () => {
  it('requestOtp: credentialed POST, no CSRF, no storage', async () => {
    let cap: Cap | undefined;
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null, removeItem: vi.fn() });
    vi.stubGlobal('fetch', mockFetch(200, { ok: true }, (c) => (cap = c)));

    await developerApi.requestOtp('a@x.co');

    expect(cap!.url).toMatch(/\/auth\/request-otp$/);
    expect(cap!.init.method).toBe('POST');
    expect(cap!.init.credentials).toBe('include');
    expect(JSON.parse(cap!.init.body as string)).toEqual({ email: 'a@x.co' });
    expect(headers(cap!.init)['X-CSRF-Token']).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled(); // session never persisted client-side
  });

  it('verify: returns user + csrf token', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { ok: true, csrf_token: 'T0', user: { id: 'u1', email: 'a@x.co' } }));
    const r = await developerApi.verify('a@x.co', '123456');
    expect(r.csrf_token).toBe('T0');
    expect(r.user.email).toBe('a@x.co');
  });

  it('me: restores session (GET)', async () => {
    let cap: Cap | undefined;
    vi.stubGlobal('fetch', mockFetch(200, { user: { id: 'u1' }, csrf_token: 'T1' }, (c) => (cap = c)));
    const r = await developerApi.me();
    expect(cap!.url).toMatch(/\/auth\/me$/);
    expect(cap!.init.method ?? 'GET').toBe('GET');
    expect(cap!.init.credentials).toBe('include');
    expect(r.csrf_token).toBe('T1');
  });

  it('logout: sends X-CSRF-Token', async () => {
    let cap: Cap | undefined;
    vi.stubGlobal('fetch', mockFetch(200, { ok: true }, (c) => (cap = c)));
    await developerApi.logout('CSRF123');
    expect(cap!.url).toMatch(/\/auth\/logout$/);
    expect(cap!.init.method).toBe('POST');
    expect(headers(cap!.init)['X-CSRF-Token']).toBe('CSRF123');
  });

  it('mutations carry CSRF + credentials', async () => {
    let cap: Cap | undefined;
    vi.stubGlobal('fetch', mockFetch(201, { id: 'ws1' }, (c) => (cap = c)));
    await developerApi.createWorkspace('WS', 'CSRFx');
    expect(cap!.init.credentials).toBe('include');
    expect(headers(cap!.init)['X-CSRF-Token']).toBe('CSRFx');
  });

  it('error mapping: 401/403/429/409(last owner)/410/400/5xx', async () => {
    const cases: Array<[number, unknown, string]> = [
      [401, {}, 'UNAUTHENTICATED'],
      [403, {}, 'FORBIDDEN'],
      [429, {}, 'RATE_LIMITED'],
      [409, { error: { code: 'LAST_OWNER' } }, 'LAST_OWNER'],
      [410, {}, 'INVITE_INVALID'],
      [400, {}, 'VALIDATION'],
      [503, {}, 'UNAVAILABLE'],
    ];
    for (const [st, body, code] of cases) {
      vi.stubGlobal('fetch', mockFetch(st, body));
      await expect(developerApi.me()).rejects.toMatchObject({ code });
    }
  });

  it('reveal-once: createKey returns the secret, listKeys never does', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(201, {
        id: 'k1',
        kind: 'SECRET',
        prefix: 'bz_test_sk_51Rz8a4b',
        secret: 'bz_test_sk_FULLSECRETVALUE',
        scopes: ['payments:write'],
        status: 'ACTIVE',
      }),
    );
    const created = await developerApi.createKey('p1', 'SECRET', 'server', ['payments:write'], 'C');
    expect(created.secret).toBe('bz_test_sk_FULLSECRETVALUE');

    vi.stubGlobal(
      'fetch',
      mockFetch(200, { keys: [{ id: 'k1', kind: 'SECRET', prefix: 'bz_test_sk_51Rz8a4b', status: 'ACTIVE', scopes: ['payments:write'] }] }),
    );
    const list = await developerApi.listKeys('p1');
    expect((list.keys[0] as { secret?: string }).secret).toBeUndefined();
    expect(list.keys[0].prefix).toBe('bz_test_sk_51Rz8a4b');
  });

  it('rotate/revoke hit the right endpoints with CSRF', async () => {
    let cap: Cap | undefined;
    vi.stubGlobal('fetch', mockFetch(200, { id: 'k2', secret: 'bz_test_sk_NEW' }, (c) => (cap = c)));
    const rotated = await developerApi.rotateKey('k1', 'C');
    expect(cap!.url).toMatch(/\/keys\/k1\/rotate$/);
    expect(cap!.init.method).toBe('POST');
    expect(headers(cap!.init)['X-CSRF-Token']).toBe('C');
    expect(rotated.secret).toBe('bz_test_sk_NEW');

    vi.stubGlobal('fetch', mockFetch(200, { ok: true }, (c) => (cap = c)));
    await developerApi.revokeKey('k1', 'C');
    expect(cap!.url).toMatch(/\/keys\/k1$/);
    expect(cap!.init.method).toBe('DELETE');
    expect(headers(cap!.init)['X-CSRF-Token']).toBe('C');
  });

  it('network failure maps to NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    await expect(developerApi.me()).rejects.toBeInstanceOf(ApiError);
    await expect(developerApi.me()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
