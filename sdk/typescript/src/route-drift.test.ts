/**
 * Every SDK method must point at a route the gateway actually mounts.
 *
 * This is the cheapest defect in the system to create and the most expensive to
 * discover: an SDK method with a plausible path compiles, ships, publishes, and
 * fails at the integrator's first call with a 404 that looks like their mistake.
 * Nine webhook methods were added in one change; a single typo in any of them
 * would have reached npm.
 *
 * So the check reads the gateway's own router and the SDK's own request calls,
 * and refuses to let them disagree. It parses source rather than asking a
 * running server on purpose — a test that needs the Sandbox up is a test that
 * gets skipped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER = join(process.cwd(), '../../services/api-gateway/internal/server/server.go');
const CLIENT = join(process.cwd(), 'src/client.ts');

/**
 * Line range of the r.Group that installs DualAuth.
 *
 * Found by locating the DualAuth line, walking BACK to the enclosing
 * `r.Group(func(r chi.Router) {`, then forward until that group's braces close.
 * Tracking brace depth from the DualAuth line itself does not work: it sits
 * inside an `if devKeyClient != nil {` whose close would end the region
 * immediately, and the parser would silently match nothing.
 */
function dualAuthRange(lines: string[]): [number, number] {
  const hit = lines.findIndex((l) => /middleware\.DualAuth\(/.test(l));
  if (hit < 0) return [-1, -1];
  let start = hit;
  while (start > 0 && !/r\.Group\(func\(r chi\.Router\)\s*\{/.test(lines[start])) start--;
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
    if (i > start && depth <= 0) return [start, i];
  }
  return [start, lines.length - 1];
}

/**
 * Mounted paths, assembled by walking r.Route(...) nesting in the Go router.
 *
 * `dualAuth` collects the subset reachable with a Developer Platform project
 * key: the routes inside the group whose middleware chain includes DualAuth.
 * Everything else needs a merchant JWT, which this SDK's audience does not hold
 * — see the credential-reachability test below for why that distinction earns
 * its own parser.
 */
function mountedRoutes(src: string, opts: { dualAuthOnly?: boolean } = {}): Set<string> {
  const out = new Set<string>();
  const stack: { prefix: string; depth: number }[] = [];
  let depth = 0;
  const lines = src.split('\n');
  const window = opts.dualAuthOnly ? dualAuthRange(lines) : null;

  for (const [i, line] of lines.entries()) {
    const route = line.match(/r\.Route\("([^"]+)"/);
    const verb = line.match(/r\.(Get|Post|Put|Patch|Delete)\("([^"]+)"/);

    if (verb && (!window || (i >= window[0] && i <= window[1]))) {
      const path = stack.map((s) => s.prefix).join('') + (verb[2] === '/' ? '' : verb[2]);
      // The SDK's request() composes `${base}/v1${path}`, so its paths are
      // version-relative. Compare like with like.
      out.add(path.replace(/^\/v1/, '').replace(/\{[^}]+\}/g, '{p}'));
    }

    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (route) stack.push({ prefix: route[1], depth });
    depth += opens - closes;
    while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
  }
  return out;
}

/** Paths the SDK asks for, normalised the same way. */
function sdkPaths(src: string): { path: string; line: number }[] {
  const out: { path: string; line: number }[] = [];
  src.split('\n').forEach((line, i) => {
    // this.request<T>('/x') or this.request<T>(`/x/${id}`)
    const m = line.match(/this\.request<[^>]*>\(\s*[`']([^`'$]*(?:\$\{[^}]*\}[^`']*)*)[`']/);
    if (!m) return;
    const raw = m[1]
      .replace(/\$\{[^}]*\}/g, '{p}')     // path params
      .replace(/\{p\}[^/]*$/, '{p}')      // a trailing query-string helper
      .split('?')[0]
      .replace(/\/$/, '');
    if (raw.startsWith('/')) out.push({ path: raw, line: i + 1 });
  });
  return out;
}

describe('SDK ↔ gateway route drift', () => {
  const mounted = mountedRoutes(readFileSync(SERVER, 'utf8'));
  const asked = sdkPaths(readFileSync(CLIENT, 'utf8'));

  it('parsed a plausible router (guards against the parser silently matching nothing)', () => {
    // If this fails the router shape changed and every assertion below became
    // vacuous — which is far worse than a drift it might have caught.
    expect(mounted.size).toBeGreaterThan(20);
    expect([...mounted]).toContain('/business/wallet-accounts');
    expect(asked.length).toBeGreaterThan(20);
  });

  it('every path the SDK requests is mounted by the gateway', () => {
    const missing = asked.filter((a) => !mounted.has(a.path));
    expect(
      missing.map((m) => `client.ts:${m.line} → ${m.path}`),
      'SDK methods pointing at routes the gateway does not mount',
    ).toEqual([]);
  });

  it('every financial method is reachable with the key this SDK documents', () => {
    // The path existing is not the same as the credential reaching it.
    //
    // createRefund pointed at /refunds — mounted, but under merchant-JWT auth —
    // so it answered 401 for bz_test_sk_…, the only credential this SDK's README
    // documents. The refunds capability was advertised as available and was
    // unreachable through the SDK; DOA's production refund path was calling it.
    // Path-existence alone could never have caught that, so reachability is
    // checked separately.
    //
    // That was fixed the wrong way round at first: the client moved to
    // /business/refunds to match where the server had it. The server moved
    // instead — /v1/refunds is dual-auth now — so the assertion below is that
    // refunds are reachable at the PUBLIC path, not that the SDK avoids it.
    const dual = mountedRoutes(readFileSync(SERVER, 'utf8'), { dualAuthOnly: true });
    expect(dual.size, 'dual-credential group parsed as empty — the check would be vacuous')
      .toBeGreaterThan(5);

    // Methods that move or read money on behalf of the integrating application.
    // A merchant-only method is not a bug in itself; one of THESE being
    // merchant-only is.
    const FINANCIAL = [
      '/business/payment-sessions',
      '/business/wallet-accounts',
      '/refunds',
      '/business/transfers',
      '/business/webhooks/endpoints',
      '/business/me',
    ];
    const unreachable = FINANCIAL.filter((p) => !dual.has(p));
    expect(unreachable, 'financial routes a project key cannot reach').toEqual([]);

    // And the SDK must call the public path, never the withdrawn one.
    const client = readFileSync(CLIENT, 'utf8');
    for (const legacy of ["'/business/refunds'", "`/business/refunds/"]) {
      expect(client.includes(legacy), `SDK still calls the withdrawn ${legacy}`).toBe(false);
    }
    expect(client.includes("'/refunds'"), 'SDK does not call the public refund route').toBe(true);
  });

  it('the new webhook management routes are among them', () => {
    for (const p of [
      '/business/webhooks/endpoints',
      '/business/webhooks/endpoints/{p}',
      '/business/webhooks/endpoints/{p}/rotate-secret',
      '/business/webhooks/events',
      '/business/webhooks/events/{p}/deliveries',
      '/business/webhooks/deliveries/{p}/replay',
    ]) {
      expect([...mounted], `${p} is not mounted`).toContain(p);
    }
  });
});
