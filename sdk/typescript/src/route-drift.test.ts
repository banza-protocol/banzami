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

/** Mounted paths, assembled by walking r.Route(...) nesting in the Go router. */
function mountedRoutes(src: string): Set<string> {
  const out = new Set<string>();
  const stack: { prefix: string; depth: number }[] = [];
  let depth = 0;

  for (const line of src.split('\n')) {
    const route = line.match(/r\.Route\("([^"]+)"/);
    const verb = line.match(/r\.(Get|Post|Put|Patch|Delete)\("([^"]+)"/);

    if (verb) {
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
