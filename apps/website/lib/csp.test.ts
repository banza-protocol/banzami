import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectOrigins, contentSecurityPolicy } from './csp';

/**
 * The policy must permit every origin this app actually calls.
 *
 * The first version of this CSP shipped to production and broke the Developer
 * Console's sign-in: connect-src listed api.banzami.com and
 * sandbox-api.banzami.com, and the Console calls developer-api.banzami.com,
 * which never appears as a literal in the source — it is built from
 * NEXT_PUBLIC_DEVELOPER_API_URL with a default inside lib/developer-api.ts. A
 * search for origins found the ones that were written down and missed the one
 * that was computed.
 *
 * So this reads the defaults back out of those two modules and asserts they are
 * in the policy. Adding a third API client with a new default fails here rather
 * than in a browser.
 */
const CLIENT_MODULES = ['lib/api.ts', 'lib/developer-api.ts'];

/** Every https:// origin used as a fallback in an API base-URL expression. */
function declaredDefaults(): string[] {
  const found = new Set<string>();
  for (const rel of CLIENT_MODULES) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    for (const m of src.matchAll(/process\.env\.NEXT_PUBLIC_[A-Z_]+\s*(?:\|\||\?\?)\s*'(https:\/\/[^']+)'/g)) {
      found.add(new URL(m[1]).origin);
    }
  }
  return [...found];
}

describe('content security policy', () => {
  it('finds the API defaults it is meant to check', () => {
    // Guards the test itself: if the regex stops matching because those modules
    // are rewritten, this fails loudly instead of asserting nothing.
    const defaults = declaredDefaults();
    expect(defaults.length).toBeGreaterThanOrEqual(2);
    expect(defaults).toContain('https://developer-api.banzami.com');
  });

  it('permits every API origin the app can call', () => {
    const origins = connectOrigins({});
    for (const d of declaredDefaults()) {
      expect(origins, `connect-src is missing ${d}`).toContain(d);
    }
  });

  it('permits an overridden API origin too', () => {
    const origins = connectOrigins({
      NEXT_PUBLIC_DEVELOPER_API_URL: 'https://developer-api.sandbox.example/v1/',
    } as NodeJS.ProcessEnv);
    // The origin, not the path — a path in connect-src would not match anyway.
    expect(origins).toContain('https://developer-api.sandbox.example');
  });

  it('ignores an unparseable override instead of emitting a broken directive', () => {
    const origins = connectOrigins({ NEXT_PUBLIC_BANZAMI_API_URL: 'not a url' } as NodeJS.ProcessEnv);
    expect(origins.every(o => o === "'self'" || o.startsWith('https://'))).toBe(true);
  });

  it('carries the nonce and the directives that are not negotiable', () => {
    const csp = contentSecurityPolicy('TESTNONCE', {});
    expect(csp).toContain("script-src 'self' 'nonce-TESTNONCE' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    // script-src must never fall back to allowing arbitrary inline script.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('allows the Google Fonts stylesheet and its faces, and nothing else remote', () => {
    const csp = contentSecurityPolicy('n', {});
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("default-src 'self'");
  });
});
