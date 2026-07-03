import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_HEADER,
  TOLERANCE_SECONDS,
  verifySignature,
  constructEvent,
  generateTestSignature,
  generateTestEvent,
  BanzamiWebhookSignatureError,
} from './webhooks.js';

// The canonical webhook signature header is `banza-signature` — exactly what the
// operator (services/api-gateway/internal/webhook/signer.go) emits. This suite
// pins that contract and the HMAC-SHA256 + replay-window behaviour.
const SECRET = 'whsec_test_secret';

describe('webhook signature — canonical banza-signature contract', () => {
  it('exposes the canonical header name (not the former Banzami-Signature)', () => {
    expect(SIGNATURE_HEADER).toBe('banza-signature');
    expect(SIGNATURE_HEADER).not.toBe('Banzami-Signature');
    expect(TOLERANCE_SECONDS).toBe(300);
  });

  it('accepts a valid HMAC-SHA256 signature', () => {
    const now = 1_716_000_000;
    const body = JSON.stringify(generateTestEvent('payment_link.paid', { id: 'link_1' }));
    const sig = generateTestSignature(body, SECRET, now);
    expect(() => verifySignature(body, sig, SECRET, { currentTimestamp: now })).not.toThrow();
    expect(constructEvent(body, sig, SECRET, { currentTimestamp: now }).type).toBe('payment_link.paid');
  });

  it('rejects a tampered body and a wrong secret', () => {
    const now = 1_716_000_000;
    const body = JSON.stringify(generateTestEvent('payment_link.paid', { id: 'link_1' }));
    const sig = generateTestSignature(body, SECRET, now);
    expect(() => verifySignature(body + ' ', sig, SECRET, { currentTimestamp: now })).toThrow(BanzamiWebhookSignatureError);
    expect(() => verifySignature(body, sig, 'whsec_wrong', { currentTimestamp: now })).toThrow(BanzamiWebhookSignatureError);
  });

  it('rejects a timestamp outside the 300s replay window and accepts within it', () => {
    const signedAt = 1_716_000_000;
    const body = 'payload';
    const sig = generateTestSignature(body, SECRET, signedAt);
    expect(() => verifySignature(body, sig, SECRET, { currentTimestamp: signedAt + 301 })).toThrow(/replay/i);
    expect(() => verifySignature(body, sig, SECRET, { currentTimestamp: signedAt + 299 })).not.toThrow();
  });

  it('rejects a missing header', () => {
    expect(() => verifySignature('x', '', SECRET)).toThrow(/missing/i);
  });
});
