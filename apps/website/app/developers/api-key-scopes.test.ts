/**
 * The Console's scope picker must offer exactly the scopes a released Gateway
 * route enforces — no more, no fewer.
 *
 * Neither half of that is pedantry. The picker previously offered eight inert
 * scopes (payments:*, transfers:*, refunds:write, webhooks:*, customers:read):
 * no route consults any of them, so a key built from that screen authorized
 * nothing, while none of the scopes the public Quickstart needs was selectable
 * at all. The failure surfaced at the developer's first API call, with a key
 * that looked correctly configured.
 *
 * So this reads the server's own EnforcedScopes and pins both directions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GO = join(process.cwd(), '../../services/developer-api/internal/developer/store.go');
const UI = join(process.cwd(), 'components/developers/portal/ApiKeysManager.tsx');

/** Parse a `var <name> = map[string]bool{ "a": true, ... }` block out of the Go source. */
function goScopeSet(src: string, name: string): string[] {
  const start = src.indexOf(`var ${name} = map[string]bool{`);
  if (start < 0) throw new Error(`${name} not found — did it get renamed?`);
  const body = src.slice(start, src.indexOf('\n}', start));
  return [...body.matchAll(/"([a-z_]+:[a-z]+)"/g)].map((m) => m[1]);
}

/** Parse the `const ALL_SCOPES = [ ... ]` literal out of the Console source. */
function uiScopes(src: string): string[] {
  const start = src.indexOf('const ALL_SCOPES = [');
  if (start < 0) throw new Error('ALL_SCOPES not found — did it get renamed?');
  const body = src.slice(start, src.indexOf('];', start));
  return [...body.matchAll(/'([a-z_]+:[a-z]+)'/g)].map((m) => m[1]);
}

describe('Console scope picker', () => {
  const enforced = goScopeSet(readFileSync(GO, 'utf8'), 'EnforcedScopes');
  const allowed = goScopeSet(readFileSync(GO, 'utf8'), 'AllowedScopes');
  const offered = uiScopes(readFileSync(UI, 'utf8'));

  it('offers every scope a released route enforces', () => {
    expect([...offered].sort()).toEqual([...enforced].sort());
  });

  it('offers no scope the server would reject outright', () => {
    for (const sc of offered) expect(allowed, `${sc} is not in AllowedScopes`).toContain(sc);
  });

  it('explains what each offered scope grants', () => {
    const help = readFileSync(UI, 'utf8');
    for (const sc of offered) expect(help, `${sc} has no SCOPE_HELP entry`).toContain(`'${sc}':`);
  });

  it('warns that settlement moves money', () => {
    // The one scope on the list that pays funds away rather than taking them in.
    expect(readFileSync(UI, 'utf8')).toContain('move dinheiro para um beneficiário');
  });
});
