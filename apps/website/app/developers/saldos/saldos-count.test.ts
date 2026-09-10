/**
 * The count above the table must describe the table.
 *
 * PRIMARY — the account created with the project's financial environment — is
 * excluded from `own`, which is right for one decision: a project holding only
 * a PRIMARY has not opened any account of its own and should see the empty
 * state, not a furnished-looking list.
 *
 * The same filtered array was also driving the heading, while the table below
 * rendered every account. A project with two of its own accounts therefore read
 * "2 contas neste projeto" directly above three rows — and the third was the one
 * holding the balance, so the number disagreed with the money.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'app/developers/saldos/page.tsx'), 'utf8');
const CODE = SRC.split('\n').filter((l) => {
  const t = l.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');

describe('Console balances', () => {
  it('counts what the table renders', () => {
    // Both the heading and the rows come from state.accounts.
    expect(CODE).toMatch(/\{state\.accounts\.length\} conta/);
    expect(CODE).toMatch(/\{state\.accounts\.map\(/);
    expect(CODE).not.toMatch(/\{own\.length\} conta/);
  });

  it('still shows the empty state to a project that has opened nothing', () => {
    // The PRIMARY exclusion survives where it belongs, and only there.
    expect(CODE).toMatch(/const own = state\.accounts\.filter\(\(a\) => a\.purpose !== 'PRIMARY'\)/);
    expect(CODE).toMatch(/if \(own\.length === 0\)/);
  });

  it('says which account the developer did not open', () => {
    expect(CODE).toMatch(/conta principal do negócio/);
  });
});
