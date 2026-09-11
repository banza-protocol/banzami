import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { merchantReference } from './transaction-reference';

const UUID = '9f1c2b7d-4e3a-4b1c-8d2e-1a2b3c4d5e6f';

describe('the Console reference column', () => {
  it("shows a payment's merchant reference", () => {
    expect(merchantReference({ type: 'payment', reference_id: 'campanha-42' })).toBe('campanha-42');
  });

  it('shows nothing — never an internal id — when there is no merchant reference', () => {
    expect(merchantReference({ type: 'payment', reference_id: '' })).toBeNull();
    // A refund's reference is the refunded payment's id; a transfer's is the
    // source wallet account's id. Operator identifiers, not references.
    expect(merchantReference({ type: 'refund', reference_id: UUID })).toBeNull();
    expect(merchantReference({ type: 'transfer', reference_id: UUID })).toBeNull();
  });

  it('no Console surface falls back to the row id', () => {
    for (const rel of ['app/developers/transacoes/page.tsx', 'components/developers/portal/RefundDialog.tsx']) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src, rel).not.toMatch(/reference_id \|\| (t|payment)\.id/);
    }
  });
});
