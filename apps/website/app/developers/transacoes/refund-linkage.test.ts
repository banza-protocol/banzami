import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A refund must link to the payment it returns, and a fully-refunded payment must
// stop offering an active refund. These lock the Transações projection/UI contract
// surfaced by the live Juntos por Angola refund (which read "n/d" and kept an
// active "Reembolsar").
const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('Transações — refund linkage and remaining-refundable gate', () => {
  it('the refund action follows remaining_refundable, not merely status === PAID', () => {
    expect(page).toMatch(/remaining_refundable_minor === 0[\s\S]*return false/);
  });

  it('a refund row shows its original payment, not "n/d"', () => {
    expect(page).toContain('Pagamento original');
    expect(page).toContain('t.original_reference');
  });

  it('a fully-refunded payment reads "Reembolsado" and offers no refund button', () => {
    expect(page).toContain('Reembolsado integralmente');
    // The action cell shows "Reembolsado" instead of the button when remaining is 0.
    expect(page).toMatch(/remaining_refundable_minor === 0 \?[\s\S]*Reembolsado/);
  });
});
