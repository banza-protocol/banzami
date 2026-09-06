/**
 * Nothing visible in the Console may be a placeholder, a dead control, or a
 * claim the platform cannot back.
 *
 * Each assertion here corresponds to something that was actually shipped and
 * had to be removed:
 *
 *   a "Clientes" page for a resource that does not exist — customers:read
 *   resolves one @handle and deliberately returns nothing else, because a
 *   project-scoped customer list would be a directory of strangers' accounts
 *
 *   a Status item painted green in the markup, which reported healthy through
 *   every outage this platform has had
 *
 *   a notification bell with no handler and an unread dot that was always on
 *
 *   an avatar with a chevron that looked like a menu and signed you out on the
 *   first click
 *
 *   pages whose whole content was "Esta secção está a ser preparada"
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (src: string) =>
  src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('{/*')).join('\n');

const SHELL = code(read('components/developers/portal/PortalShell.tsx'));

/**
 * Every route the sidebar and header can reach. The main navigation is an array
 * of objects, the footer links are JSX attributes, and reading only one of the
 * two shapes made this check pass over most of the Console without noticing.
 */
function navRoutes(): string[] {
  const attrs = [...SHELL.matchAll(/href="(\/[a-z-]*)"/g)].map((m) => m[1]);
  const props = [...SHELL.matchAll(/href:\s*'(\/[a-z-]*)'/g)].map((m) => m[1]);
  return [...new Set([...attrs, ...props])].filter((h) => h !== '/docs');
}

describe('Console navigation', () => {
  it('offers no route to a customer directory, which does not exist', () => {
    expect(SHELL).not.toMatch(/'clientes'/);
    expect(existsSync(join(ROOT, 'app/developers/clientes'))).toBe(false);
  });

  it('offers no hard-coded operational status', () => {
    expect(SHELL).not.toMatch(/Operacional/);
    expect(existsSync(join(ROOT, 'app/developers/status'))).toBe(false);
  });

  it('has no notification bell, because there is no notification backend', () => {
    expect(SHELL).not.toMatch(/IconBell/);
    expect(SHELL).not.toMatch(/Notificações/);
  });

  it('labels the account control as what it does', () => {
    expect(SHELL).toMatch(/Terminar sessão/);
    // A chevron next to an avatar promises a menu, and this one signed you out
    // on the first click. Scoped to that control: the project selector is a
    // real selector and its chevron is honest.
    const i = SHELL.indexOf('onClick={onLogout}');
    expect(i).toBeGreaterThan(-1);
    const control = SHELL.slice(i, SHELL.indexOf('</button>', i));
    expect(control).not.toMatch(/IconChevronDown/);
  });
});

describe('Console pages', () => {
  const pages = readdirSync(join(ROOT, 'app/developers'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'app/developers', d.name, 'page.tsx')))
    .map((d) => d.name);

  it('renders no placeholder in a route the navigation offers', () => {
    const reachable = new Set(navRoutes().map((h) => h.replace(/^\//, '')).filter(Boolean));
    // Comments name the placeholder a page stopped being, which is the
    // opposite of rendering one.
    const placeholders = pages.filter(
      (p) => reachable.has(p) && /StubContent|está a ser preparada/.test(code(read(`app/developers/${p}/page.tsx`))),
    );
    expect(placeholders).toEqual([]);
  });

  it('every navigation target exists', () => {
    for (const h of navRoutes()) {
      const dir = h.replace(/^\//, '');
      if (!dir) continue; // "/" is the dashboard route group
      expect(existsSync(join(ROOT, 'app/developers', dir))).toBe(true);
    }
  });
});
