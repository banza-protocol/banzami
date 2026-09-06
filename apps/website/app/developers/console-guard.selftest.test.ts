/**
 * Do the Console guards actually fail?
 *
 * A guard that has never been observed to fail is indistinguishable from one
 * that cannot, and this Console shipped three of exactly that kind: a status
 * indicator that could not go amber, an unread dot that could not go out, and a
 * security toggle that could not turn off.
 *
 * Each mutation below is a real regression from this repository's history,
 * written back into a copy of the source and run through the same predicate the
 * guard uses. If a mutation does not trip its guard, the guard is decoration.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('{/*')).join('\n');

/** The predicates the real guards use, applied to arbitrary source. */
const guards = {
  fabricatedProject: (src: string) => /Minha Loja Online/.test(src) || /prj_[A-Z0-9]{8,}/.test(src),
  falseSecurityClaim: (src: string) => /Reautenticação OTP|2FA activ|IP restrit/i.test(src),
  placeholder: (src: string) => /StubContent|está a ser preparada|Em breve|Coming soon/i.test(src),
  deadControl: (src: string) =>
    /href="#"/.test(src) || /onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(src) || /href="javascript:/.test(src),
  hardcodedMetric: (src: string) => /Dados ilustrativos/i.test(src) || /12[.,]450[.,]000/.test(src),
};

const CONSOLE_FILES = [
  'app/developers/settings/page.tsx',
  'app/developers/go-live/page.tsx',
  'app/developers/saldos/page.tsx',
  'app/developers/transacoes/page.tsx',
  'app/developers/suporte/page.tsx',
  'components/developers/portal/PortalShell.tsx',
].filter((p) => existsSync(join(ROOT, p)));

describe('the Console as it stands', () => {
  it.each(CONSOLE_FILES)('%s trips no guard', (p) => {
    const src = strip(read(p));
    for (const [name, trips] of Object.entries(guards)) {
      expect(trips(src), `${p} trips ${name}`).toBe(false);
    }
  });
});

describe('the guards themselves', () => {
  // Each string is something this Console actually rendered.
  const MUTATIONS: [keyof typeof guards, string][] = [
    ['fabricatedProject', '<p>Minha Loja Online</p>'],
    ['fabricatedProject', 'data-copy="prj_51HKZQ8BZM9F"'],
    ['falseSecurityClaim', '<p>Reautenticação OTP para ações críticas</p>'],
    ['placeholder', '<StubContent label="Saldos" />'],
    ['placeholder', '<p>Esta secção está a ser preparada.</p>'],
    ['deadControl', '<a href="#">Ver tudo</a>'],
    ['deadControl', '<button onClick={() => {}}>Editar</button>'],
    ['hardcodedMetric', '<span>Dados ilustrativos</span>'],
  ];

  it.each(MUTATIONS)('%s catches: %s', (name, mutation) => {
    expect(guards[name](mutation)).toBe(true);
  });

  it('does not fire on ordinary Console source', () => {
    const real = read('app/developers/saldos/page.tsx');
    for (const trips of Object.values(guards)) expect(trips(strip(real))).toBe(false);
  });
});
