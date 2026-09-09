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
  it('never coalesces a stored amount column to a literal figure', () => {
    // The sin is inventing a number for an operation that has none. A fallback
    // to another column can be correct — see the next test for the condition
    // that keeps it correct — but a literal is always an invention.
    const invented = [...SQL.matchAll(/COALESCE\(\s*[a-z]+\.amount_minor\s*,\s*(-?\d+)/gi)];
    expect(invented.map((m) => m[0])).toEqual([]);
  });

  it('never answers "how much arrived" with "how much was asked"', () => {
    // payment_sessions.amount_minor is the REQUESTED amount. Using it as the
    // fallback for a received amount reports a figure nobody paid — and for an
    // open-amount session, one that was never even named.
    const requestedAsReceived = [...SQL.matchAll(
      /COALESCE\(\s*[a-z]+\.amount_minor\s*,\s*s\.amount_minor/gi)];
    expect(requestedAsReceived.map((m) => m[0])).toEqual([]);
  });

  it('a received amount may fall back only to another receipt', () => {
    // acquiring_payments is the provider's receipt; a fixed-amount link's own
    // figure is what a payer of that link paid. Both are amounts that arrived.
    const fallbacks = [...SQL.matchAll(
      /COALESCE\(\s*([a-z]+)\.amount_minor\s*,\s*([a-z]+)\.amount_minor/gi)];
    for (const [, from, to] of fallbacks) {
      expect(['ap', 'pl']).toContain(from);
      expect(['ap', 'pl']).toContain(to);
    }
  });

  it('does coalesce a sum, because an account with no entries holds nothing', () => {
    expect(SQL).toMatch(/COALESCE\(SUM\(CASE WHEN e\.entry_type/);
  });
});
