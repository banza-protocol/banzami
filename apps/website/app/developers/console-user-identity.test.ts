/**
 * The Console must not put a person's identity on screen that it invented, and
 * must not report an action it did not perform.
 *
 * Every assertion here is a thing that shipped:
 *
 *   the header avatar drew `email.slice(0,2)` as if it were initials, so two
 *   colleagues at one domain rendered the identical circle and the only place
 *   the real identity appeared was a title tooltip
 *
 *   the avatar was a single button whose entire action was signing out — no
 *   menu, no confirmation, no way back
 *
 *   logout swallowed the server's refusal and cleared local state anyway, so a
 *   503 that deliberately KEEPS the session cookie still showed as signed out
 *
 *   the project chip carried a chevron and a pointer cursor with no handler
 *   behind it, and the onboarding profile form discarded everything typed into
 *   it
 *
 * Node-only (fs): these are properties of the source, so they cannot be
 * satisfied by a component that happens not to be rendered in a test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** Comments describe what was removed; only executable lines are evidence. */
const code = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
    })
    .join('\n');

const SHELL = code(read('components/developers/portal/PortalShell.tsx'));
const MENU = code(read('components/developers/portal/UserMenu.tsx'));
const AUTH = code(read('components/developers/portal/DeveloperAuth.tsx'));
const PROFILE = code(read('app/developers/onboarding/profile/page.tsx'));

describe('Console identity — the avatar', () => {
  it('derives no initials from the email address anywhere', () => {
    for (const [name, src] of [['PortalShell', SHELL], ['UserMenu', MENU]] as const) {
      expect(src, `${name} slices the email`).not.toMatch(/email[^\n]*\.slice\(/);
    }
  });

  it('is a menu trigger, not a sign-out button', () => {
    expect(SHELL).toMatch(/<UserMenu\b/);
    expect(MENU).toMatch(/aria-haspopup="menu"/);
    expect(MENU).toMatch(/aria-expanded=\{open\}/);
    expect(MENU).toMatch(/role="menu"/);
    expect(MENU).toMatch(/role="menuitem"/);
    // The header no longer carries sign-out as a permanent control: it lives
    // in the menu, behind a confirmation.
    expect(SHELL).not.toMatch(/Terminar sessão/);
  });

  it('offers the email and the name as readable text, not as a tooltip', () => {
    expect(MENU).toMatch(/\{user\?\.email/);
    expect(MENU).not.toMatch(/title=\{[^}]*email/);
  });
});

describe('Console identity — signing out', () => {
  it('does not clear local state when the server refused to revoke', () => {
    // The old shape: catch, comment, clear() regardless. The cookie is kept by
    // the server on a failed revoke, so clearing here produced a live session
    // behind a Console showing the sign-in page.
    expect(AUTH).toMatch(/throw e;/);
    const i = AUTH.indexOf('const logout');
    expect(i).toBeGreaterThan(-1);
    const fn = AUTH.slice(i, AUTH.indexOf('return (', i));
    // A bare `catch {` in logout is the defect itself: it can only discard.
    expect(fn).not.toMatch(/catch\s*\{/);
  });

  it('puts a confirmation between the click and the revoke', () => {
    expect(MENU).toMatch(/ConfirmDialog/);
    expect(MENU).toMatch(/Terminar sessão neste dispositivo\?/);
    expect(MENU).toMatch(/confirmLabel="Terminar sessão"/);
  });
});

describe('Console identity — controls that only looked like controls', () => {
  it('the project chip in the top bar is not dressed as a switcher', () => {
    const i = SHELL.indexOf('IconBriefcase size={15}');
    expect(i).toBeGreaterThan(-1);
    const chip = SHELL.slice(SHELL.lastIndexOf('<span', i), SHELL.indexOf('</span>', i));
    expect(chip).not.toMatch(/cursor: 'pointer'/);
    expect(SHELL).not.toMatch(/IconChevronDown/);
  });

  it('the onboarding profile actually stores what it collects', () => {
    expect(PROFILE).toMatch(/developerApi\.setName\(/);
    // Controlled field, and the route change happens after the call, not
    // instead of it.
    expect(PROFILE).toMatch(/value=\{name\}/);
    expect(PROFILE).not.toMatch(/defaultValue/);
    const save = PROFILE.slice(PROFILE.indexOf('async function save'));
    expect(save.indexOf('developerApi.setName(')).toBeLessThan(save.indexOf("router.push('/onboarding/project')"));
    // The role dropdown had nowhere to be stored, so it is gone rather than
    // translated — collecting an answer and binning it is not a language bug.
    expect(PROFILE).not.toMatch(/<select/);
    for (const en of ['Founder', 'Product Manager', 'Operations']) {
      expect(PROFILE, `${en} still offered`).not.toContain(en);
    }
  });
});

describe('Console identity — the words on screen', () => {
  it('speaks Portuguese in the shell and the menu', () => {
    expect(SHELL).not.toContain('Switch to Live');
    expect(SHELL).toContain('Mudar para Live');
    // The role a person sees comes from the shared Portuguese vocabulary, not
    // from ROLE_LABELS, which is the English wire word the API sends.
    expect(MENU).toMatch(/roleLabel/);
    expect(MENU).not.toMatch(/ROLE_LABELS\b/);
    const ROLES = code(read('lib/developer-roles.ts'));
    for (const pt of ['Proprietário', 'Administrador', 'Programador', 'Financeiro', 'Observador']) {
      expect(ROLES, `missing ${pt}`).toContain(pt);
    }
  });
});
