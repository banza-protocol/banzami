/**
 * Navigation and the release manifest must agree, in both directions.
 *
 * One direction stops a nav entry pointing at nothing. The other stops a page
 * quietly reappearing for a surface that was deliberately withdrawn — the
 * failure mode that produced a customer directory, an operational status and a
 * notification bell in the first place.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSOLE_SURFACES } from './console-release-manifest';

const ROOT = process.cwd();
const strip = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('{/*')).join('\n');
const SHELL = strip(readFileSync(join(ROOT, 'components/developers/portal/PortalShell.tsx'), 'utf8'));

function navRoutes(): string[] {
  const attrs = [...SHELL.matchAll(/href="(\/[a-z-]*)"/g)].map((m) => m[1]);
  const props = [...SHELL.matchAll(/href:\s*'(\/[a-z-]*)'/g)].map((m) => m[1]);
  return [...new Set([...attrs, ...props])];
}

const dirFor = (route: string) => route.replace(/^\//, '');

describe('Console release manifest', () => {
  it('every released surface has a page on disk', () => {
    for (const s of CONSOLE_SURFACES.filter((x) => x.state === 'RELEASED')) {
      if (!s.route || s.route === '/') continue; // the overview is the route group root
      expect(existsSync(join(ROOT, 'app/developers', dirFor(s.route)))).toBe(true);
    }
  });

  it('nothing not released serves a page', () => {
    for (const s of CONSOLE_SURFACES.filter((x) => x.state === 'NOT_RELEASED')) {
      expect(s.route).toBeNull();
      expect(s.note, `${s.key} must say why it is not released`).toBeTruthy();
      // The key is also the directory name these surfaces used to occupy.
      const pt: Record<string, string> = { customers: 'clientes', status: 'status', notifications: 'notificacoes' };
      expect(existsSync(join(ROOT, 'app/developers', pt[s.key] ?? s.key))).toBe(false);
    }
  });

  it('every navigation target is a released surface', () => {
    const released = new Set(CONSOLE_SURFACES.filter((s) => s.state === 'RELEASED').map((s) => s.route));
    for (const r of navRoutes()) expect(released.has(r), `navigation offers ${r}`).toBe(true);
  });

  it('no page exists for a route the manifest does not know', () => {
    const known = new Set(
      CONSOLE_SURFACES.filter((s) => s.route && s.route !== '/').map((s) => dirFor(s.route as string)),
    );
    // Routes outside the authenticated Console shell: sign-in and onboarding.
    const outside = new Set(['login', 'verify', 'onboarding', 'invites', 'dashboard']);
    const pages = readdirSync(join(ROOT, 'app/developers'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'app/developers', d.name, 'page.tsx')))
      .map((d) => d.name)
      .filter((d) => !outside.has(d));
    for (const p of pages) expect(known.has(p), `${p} is served but not in the manifest`).toBe(true);
  });
});
