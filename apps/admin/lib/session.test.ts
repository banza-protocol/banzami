// @vitest-environment jsdom
//
// A6-12. The console keeps no credential a script can read. The session is an
// HttpOnly cookie admin-api sets; what localStorage holds is the operator's
// profile, and the bearer the old console stored there is removed on sight.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroySession, getSession, readCsrfToken, saveSession } from './session';
import { AdminApi, adminMfaVerify, setStepUpPrompt, signOut } from './admin-api';

const user = { id: 'op-1', email: 'op@banzami.test', full_name: 'Op', role: 'SUPER_ADMIN' };

// What document.cookie reads. jsdom refuses to store a __Host- cookie on its
// http:// test origin (the prefix demands a secure one — as a browser does), so
// the readable cookie string is set directly.
let jar = '';
function setCookies(v: string) { jar = v; }
function clearCookies() { jar = ''; }
Object.defineProperty(document, 'cookie', { configurable: true, get: () => jar, set: () => {} });

// A plain in-memory Storage. Node's own global localStorage shadows jsdom's and
// is unusable without --localstorage-file.
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

let store: Storage;
beforeEach(() => { store = makeStorage(); vi.stubGlobal('localStorage', store); clearCookies(); });
afterEach(() => { vi.unstubAllGlobals(); setStepUpPrompt(null); });

describe('the stored session holds no credential', () => {
  it('saves only the profile, whatever the caller passes', () => {
    saveSession({ user, token: 'eyJ.session.jwt' } as never);
    const everything = Array.from({ length: store.length }, (_, i) => store.getItem(store.key(i)!)).join('|');
    expect(everything).not.toContain('eyJ.session.jwt');
    expect(getSession()).toEqual({ user });
  });

  it('removes the bearer the pre-cookie console left in localStorage', () => {
    localStorage.setItem('banzami_admin_session', JSON.stringify({ token: 'eyJ.old.bearer', user }));
    getSession();
    expect(localStorage.getItem('banzami_admin_session')).toBeNull();
    saveSession({ user });
    localStorage.setItem('banzami_admin_session', 'x');
    destroySession();
    expect(localStorage.length).toBe(0);
  });

  it('reads the CSRF token from its cookie', () => {
    expect(readCsrfToken()).toBe('');
    setCookies('other=1; __Host-bzadm_csrf=tok%2Den');
    expect(readCsrfToken()).toBe('tok-en');
  });
});

type Call = { url: string; init: RequestInit };

function stubFetch(answer: (c: Call, n: number) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const c = { url, init };
    calls.push(c);
    return answer(c, calls.length);
  }));
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const headersOf = (c: Call) => (c.init.headers ?? {}) as Record<string, string>;

describe('requests carry the cookie, never a token', () => {
  it('sends credentials, no Authorization header, and the CSRF token on a mutation only', async () => {
    setCookies('__Host-bzadm_csrf=csrf-123');
    const calls = stubFetch(() => json(200, { ok: true }));
    const api = new AdminApi();
    await api.me();
    await api.suspendOperator('op-2');
    for (const c of calls) {
      expect(c.init.credentials).toBe('include');
      expect(headersOf(c).Authorization).toBeUndefined();
    }
    expect(headersOf(calls[0])['X-CSRF-Token']).toBeUndefined();
    expect(headersOf(calls[1])['X-CSRF-Token']).toBe('csrf-123');
  });

  it('marks background polling passive, so it does not keep an idle console signed in', async () => {
    const calls = stubFetch(() => json(200, { mode: 'SANDBOX' }));
    await new AdminApi({ passive: true }).getPlatformMode();
    await new AdminApi().getPlatformMode();
    expect(headersOf(calls[0])['X-Banzadmin-Activity']).toBe('passive');
    expect(headersOf(calls[1])['X-Banzadmin-Activity']).toBeUndefined();
  });

  it('completing sign-in keeps the cookie and hands back no token', async () => {
    const calls = stubFetch(() => json(200, { expires_at: 'x', idle_timeout_seconds: 1800, user }));
    const r = await adminMfaVerify('challenge', '123456');
    expect(calls[0].init.credentials).toBe('include');
    expect(r).not.toHaveProperty('token');
  });

  it('signing out asks the server to end the session, then clears the profile', async () => {
    saveSession({ user });
    setCookies('__Host-bzadm_csrf=csrf-123');
    const calls = stubFetch(() => new Response(null, { status: 204 }));
    await signOut();
    expect(calls[0].url).toMatch(/\/admin\/v1\/auth\/logout$/);
    expect(calls[0].init.method).toBe('POST');
    expect(headersOf(calls[0])['X-CSRF-Token']).toBe('csrf-123');
    expect(getSession()).toBeNull();
  });
});

describe('step-up (A5-08)', () => {
  const stepUp = { error: { code: 'STEP_UP_REQUIRED', message: 'confirm' } };

  it('asks for a code, proves it, and retries the action once', async () => {
    const prompt = vi.fn(async () => '123456');
    setStepUpPrompt(prompt);
    const calls = stubFetch((c, n) => {
      if (c.url.endsWith('/auth/step-up')) return json(200, { stepped_up_until: 'x', expires_at: 'y' });
      return n === 1 ? json(403, stepUp) : json(200, { id: 'op-2', status: 'SUSPENDED' });
    });
    const r = await new AdminApi().suspendOperator('op-2');
    expect(r).toEqual({ id: 'op-2', status: 'SUSPENDED' });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.url.replace(/^.*\/admin\/v1/, ''))).toEqual([
      '/operators/op-2/suspend', '/auth/step-up', '/operators/op-2/suspend',
    ]);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ code: '123456' });
  });

  it('asks again, saying why, when a code is refused', async () => {
    const prompt = vi.fn()
      .mockResolvedValueOnce('000000')
      .mockResolvedValueOnce('123456');
    setStepUpPrompt(prompt);
    let stepUps = 0;
    stubFetch((c, n) => {
      if (c.url.endsWith('/auth/step-up')) {
        stepUps++;
        return stepUps === 1 ? json(403, { error: { code: 'MFA_CODE_REJECTED', message: 'no' } }) : json(200, {});
      }
      return n === 1 ? json(403, stepUp) : json(200, { ok: true });
    });
    await new AdminApi().terminateOperatorSessions('op-2');
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt.mock.calls[0][0].error).toBeUndefined();
    expect(prompt.mock.calls[1][0].error).toMatch(/não confere/);
  });

  it('cancelling leaves the action refused and unretried', async () => {
    setStepUpPrompt(async () => null);
    const calls = stubFetch(() => json(403, stepUp));
    await expect(new AdminApi().createOperator('a@b.c', 'A', 'SUPER_ADMIN')).rejects.toMatchObject({ status: 403, code: 'STEP_UP_REQUIRED' });
    expect(calls).toHaveLength(1);
  });

  it('two actions waiting on a step-up share one prompt', async () => {
    const prompt = vi.fn(async () => '123456');
    setStepUpPrompt(prompt);
    const done = new Set<string>();
    stubFetch((c) => {
      if (c.url.endsWith('/auth/step-up')) { done.add('stepped'); return json(200, {}); }
      return done.has('stepped') ? json(200, { ok: true }) : json(403, stepUp);
    });
    const api = new AdminApi();
    await Promise.all([api.processPayout('p-1'), api.processPayout('p-2')]);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
