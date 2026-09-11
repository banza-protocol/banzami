// A6-12. The console's script policy is a per-request nonce, not 'unsafe-inline'.
//
// The old static header allowed any inline <script>, which is exactly what an
// injection needs. These assertions are about the policy the browser receives
// and about the nonce reaching Next's renderer — without the request header,
// Next stamps no nonce and the policy blocks the console's own bootstrap.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function policyFor(url = 'https://admin.banzami.com/operators') {
  const res = middleware(new NextRequest(new Request(url)));
  return {
    csp: res.headers.get('content-security-policy') ?? '',
    // NextResponse.next({request:{headers}}) forwards overridden request
    // headers on the response, which is how the renderer receives them.
    requestNonce: res.headers.get('x-middleware-request-x-nonce') ?? '',
    requestCsp: res.headers.get('x-middleware-request-content-security-policy') ?? '',
  };
}

const scriptSrc = (csp: string) => csp.split('; ').find((d) => d.startsWith('script-src')) ?? '';

describe('the admin CSP', () => {
  it('nonces scripts instead of allowing inline ones', () => {
    const { csp } = policyFor();
    expect(scriptSrc(csp)).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc(csp)).toContain("'strict-dynamic'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-eval'");
    for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "connect-src 'self'"]) {
      expect(csp).toContain(d);
    }
  });

  it('gives every request its own nonce, and hands it to the renderer', () => {
    const a = policyFor();
    const b = policyFor();
    expect(a.requestNonce).not.toBe('');
    expect(a.csp).toContain(`'nonce-${a.requestNonce}'`);
    expect(a.requestCsp).toBe(a.csp);
    expect(a.requestNonce).not.toBe(b.requestNonce);
  });

  it('is not also set statically, where it could not carry a nonce', () => {
    const cfg = readFileSync(new URL('./next.config.mjs', import.meta.url), 'utf8');
    // A header entry, not the prose explaining why there is none.
    expect(cfg).not.toMatch(/key:\s*'Content-Security-Policy'/);
    expect(cfg).not.toMatch(/script-src[^\n]*unsafe-inline/);
  });
});
