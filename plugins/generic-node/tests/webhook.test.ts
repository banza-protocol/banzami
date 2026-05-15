import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { parseWebhook } from '../src/webhook.js';

const SECRET = 'webhook_secret_test';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex');
}

describe('parseWebhook', () => {
  it('returns the parsed event for a valid signature', () => {
    const payload = JSON.stringify({ type: 'payment_link.used', payload: { id: 'pl_1' } });
    const sig     = sign(payload);

    const event = parseWebhook(payload, sig, SECRET);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('payment_link.used');
    expect(event!.payload).toMatchObject({ id: 'pl_1' });
  });

  it('returns the parsed event when signature is an array (Express header array)', () => {
    const payload = JSON.stringify({ type: 'transaction.completed', payload: {} });
    const sig     = sign(payload);

    const event = parseWebhook(payload, [sig], SECRET);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('transaction.completed');
  });

  it('returns null for an invalid signature', () => {
    const payload = JSON.stringify({ type: 'payment_link.used', payload: {} });
    const event   = parseWebhook(payload, 'sha256=invalidsig', SECRET);
    expect(event).toBeNull();
  });

  it('returns null when signature is undefined', () => {
    const payload = JSON.stringify({ type: 'payment_link.used', payload: {} });
    const event   = parseWebhook(payload, undefined, SECRET);
    expect(event).toBeNull();
  });

  it('returns null when body is not valid JSON despite correct signature', () => {
    const raw = 'not-json-at-all';
    const sig = sign(raw);
    // Signature is valid but body cannot be parsed as JSON
    const event = parseWebhook(raw, sig, SECRET);
    expect(event).toBeNull();
  });

  it('works with a Buffer body', () => {
    const payload = JSON.stringify({ type: 'payout.completed', payload: { amount: 1000 } });
    const buf     = Buffer.from(payload);
    const sig     = sign(payload);

    const event = parseWebhook(buf, sig, SECRET);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('payout.completed');
  });
});
