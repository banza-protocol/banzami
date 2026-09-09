import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A Payment Session paid by an externally acquired payment credits its Wallet
// Account correctly and still reads ACTIVE, because BANZA's payment_session.paid
// requires a transfer_id and a Transfer must originate from a consumer wallet —
// which an external payer is not (BANZA RFC-0007).
//
// The Console showed only the protocol status, so a developer saw thirteen
// sessions marked ACTIVE beside a balance of 1 100 000 Kz and could not
// reconcile the two. These pin the separation that ends that, and pin that the
// separation is a SEPARATION: the session is never relabelled.
const page = readFileSync(join(process.cwd(), 'app/developers/transacoes/page.tsx'), 'utf8');

describe('acquiring state is shown beside the protocol status, never instead of it', () => {
  it('the two states have their own columns, each saying whose truth it is', () => {
    expect(page).toContain('ESTADO (PROTOCOLO)');
    expect(page).toContain('PAGAMENTO (OPERADOR)');
  });

  it('the protocol status is still rendered from status, unedited', () => {
    expect(page).toContain('<Pill kind={kindOf(t.status)}>{t.status}</Pill>');
  });

  it('the session is never relabelled PAID by the acquiring state', () => {
    // The operator column may say PAGO; it must not rewrite t.status.
    expect(page).not.toMatch(/t\.status\s*=\s*/);
    expect(page).not.toMatch(/status:\s*['"]PAID['"]/);
  });

  it('a paid acquiring state shows what was received and when', () => {
    expect(page).toContain('Recebido');
    expect(page).toContain('acquiring.paid_at');
    expect(page).toContain('acquiring.amount_minor');
  });

  it('an unpaid operation is labelled, not left blank', () => {
    expect(page).toContain('POR PAGAR');
  });

  it('the disagreement carries its reason and a reference to RFC-0007', () => {
    expect(page).toContain('protocol_note');
    expect(page).toContain('RFC-0007');
    expect(page).toContain('O estado do protocolo mantém-se');
  });

  it('a row with no acquiring state renders a dash, not an invented one', () => {
    // A refund and an internal transfer have no acquiring rail; showing them as
    // POR PAGAR would say something false about them.
    expect(page).toContain("t.acquiring ? (");
    expect(page).toContain('—');
  });

  it('refundability follows the money, not only the protocol status', () => {
    // Asking status alone refuses to refund an externally acquired payment the
    // merchant is actually holding.
    expect(page).toContain("t.acquiring?.state === 'PAID'");
  });
});
