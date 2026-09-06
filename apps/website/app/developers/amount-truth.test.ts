/**
 * The same rule on the server: a financial unknown is not zero.
 *
 * The read model carries a nullable amount, and the SQL that builds it must not
 * quietly fill it in. COALESCE is used deliberately for identifiers and labels,
 * where an empty string is the honest empty value — never for money.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(process.cwd(), '../..');
const SQL = readFileSync(join(REPO, 'services/developer-api/internal/developer/store_pg.go'), 'utf8');
const MODEL = readFileSync(join(REPO, 'services/developer-api/internal/developer/store.go'), 'utf8');

describe('developer read model', () => {
  it('keeps the transaction amount nullable', () => {
    expect(MODEL).toMatch(/AmountMinor\s+\*int64\s+`json:"amount_minor"`/);
  });

  // The distinction is between a sum and a column. COALESCE(SUM(...), 0) over an
  // account with no ledger entries is correct: no entries means no money, and
  // zero is the answer. COALESCE on a stored amount column invents a figure for
  // an operation whose amount is genuinely not set yet.
  it('never coalesces a stored amount column to zero', () => {
    const bare = [...SQL.matchAll(/COALESCE\(\s*([a-z]+\.amount_minor)/gi)].map((m) => m[1]);
    expect(bare).toEqual([]);
  });

  it('does coalesce a sum, because an account with no entries holds nothing', () => {
    expect(SQL).toMatch(/COALESCE\(SUM\(CASE WHEN e\.entry_type/);
  });
});
