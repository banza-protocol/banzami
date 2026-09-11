/**
 * Balances and operations are read for the whole Business a Project receives
 * into, not for the Project. The pages said "neste projeto" / "deste projeto"
 * over figures that include what other Projects of the same Business moved.
 * The labels must name what was read: the Business linked to this Project.
 * (Authorization is unchanged — it is still the Project's membership.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function visibleCode(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
    })
    .join('\n');
}

const SALDOS = visibleCode('app/developers/saldos/page.tsx');
const TRANSACOES = visibleCode('app/developers/transacoes/page.tsx');

describe('Console balances and operations name the Business they read', () => {
  it('balances are the accounts of the Business linked to this Project', () => {
    expect(SALDOS).toMatch(/conta\{state\.accounts\.length === 1 \? '' : 's'\} do negócio ligado a este projeto/);
    expect(SALDOS).not.toMatch(/contas?\S* neste projeto/);
    expect(SALDOS).not.toMatch(/resto do projeto/);
  });

  it('operations are those of the Business linked to this Project', () => {
    expect(TRANSACOES).toMatch(/operações no negócio ligado a este projeto/);
    expect(TRANSACOES).toMatch(/entre contas do negócio ligado a este projeto/);
    expect(TRANSACOES).not.toMatch(/operações neste projeto/);
    expect(TRANSACOES).not.toMatch(/entre contas deste projeto/);
  });
});
