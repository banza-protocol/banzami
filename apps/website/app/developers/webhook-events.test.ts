/**
 * The Console's webhook event list must be what the platform emits.
 *
 * This is the same class of defect the scope picker had, one layer along: a
 * picker that offers something the backend does not know produces a
 * subscription that never delivers, and the developer debugs their server
 * instead of their subscription. The gateway's list is authoritative — it is
 * what the delivery path checks — and developer-api validates against its own
 * copy, so three lists have to agree.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (p: string) => join(process.cwd(), '../..', p);

/** `var <name> = map[string]bool{ "a.b": true, ... }` out of Go source. */
function goEvents(file: string, name: string): string[] {
  const src = readFileSync(root(file), 'utf8');
  const start = src.indexOf(`var ${name} = map[string]bool{`);
  if (start < 0) throw new Error(`${name} not found in ${file} — renamed?`);
  const body = src.slice(start, src.indexOf('\n}', start));
  return [...body.matchAll(/"([a-z_]+\.[a-z_]+)":\s*true/g)].map((m) => m[1]);
}

/** The `EVENTS` table the Console renders. */
function uiEvents(): string[] {
  const src = readFileSync(join(process.cwd(), 'components/developers/portal/WebhookEndpointForm.tsx'), 'utf8');
  const start = src.indexOf('const EVENTS: Array<[string, string]> = [');
  if (start < 0) throw new Error('EVENTS not found — renamed?');
  const body = src.slice(start, src.indexOf('];', start));
  return [...body.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]);
}

describe('Console webhook events', () => {
  const gateway = goEvents('services/api-gateway/internal/service/webhooks.go', 'SupportedWebhookEvents');
  const devapi = goEvents('services/developer-api/internal/developer/webhooks.go', 'SupportedWebhookEvents');
  const ui = uiEvents();

  it('the two backends agree on what exists', () => {
    expect([...devapi].sort()).toEqual([...gateway].sort());
  });

  it('offers every event the platform emits', () => {
    expect([...ui].sort()).toEqual([...gateway].sort());
  });

  it('says what each event means', () => {
    // A bare event name is not an explanation, and choosing subscriptions is a
    // decision about what your server will be asked to handle.
    const src = readFileSync(join(process.cwd(), 'components/developers/portal/WebhookEndpointForm.tsx'), 'utf8');
    for (const e of ui) {
      const row = new RegExp(`'${e.replace('.', '\\.')}',\\s*'[^']{15,}'`);
      expect(src, `${e} has no description`).toMatch(row);
    }
  });

  it('does not tell the developer to go and write code instead', () => {
    // The old empty state: "Registe um com createWebhookEndpoint usando a chave
    // do projecto." Receiving a first event must not be a programming task.
    const mgr = readFileSync(join(process.cwd(), 'components/developers/portal/WebhooksManager.tsx'), 'utf8');
    const form = readFileSync(join(process.cwd(), 'components/developers/portal/WebhookEndpointForm.tsx'), 'utf8');
    expect(mgr).toContain('<WebhookEndpointForm');
    expect(form).toContain('Registar endpoint');
    expect(mgr).not.toMatch(/Registe um com <code[^>]*>createWebhookEndpoint/);
    // And the secret it produces is revealed under the same one-time rule as a
    // secret key, not printed into a page or a toast.
    expect(mgr).toContain('SecretRevealDialog');
  });
});
