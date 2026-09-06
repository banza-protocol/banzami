/**
 * A payment session with no fixed amount must never render as zero.
 *
 * DOA opens sessions where the payer chooses what to send, so amount_minor is
 * null. The query failed on them first — "cannot scan NULL into *int64" — and
 * the tempting repair was COALESCE to 0, which would have printed "0 Kz" for an
 * operation that has no amount. That is a fabricated figure of the most
 * dangerous kind: it looks like a real number, it sorts, and it sums.
 *
 * The invariant is that a financial unknown stays unknown all the way to the
 * screen. Asserted on the source because the alternative — a fixture rendering
 * a table — would test React, not the rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = read('app/developers/transacoes/page.tsx');
const CLIENT = read('lib/developer-api.ts');
const strip = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('open payment amounts', () => {
  it('the transaction type admits a missing amount', () => {
    expect(CLIENT).toMatch(/amount_minor:\s*number \| null/);
  });

  it('the page renders a state, not a zero', () => {
    const code = strip(PAGE);
    expect(code).toMatch(/if \(minor === null \|\| minor === undefined\) return 'Em aberto'/);
  });

  it('never coalesces a missing amount to zero', () => {
    const code = strip(PAGE);
    expect(code).not.toMatch(/amount_minor\s*\?\?\s*0/);
    expect(code).not.toMatch(/amount_minor\s*\|\|\s*0/);
  });
});
