import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { BanzamiWebhookSignatureError, constructEvent, verifySignature } from './webhooks';

// A2-03. An integration that never configured its webhook secret verified
// against "" — so an event signed with the empty key was accepted, and a forged
// payment_link.paid shipped goods. An empty or blank secret now refuses.
describe('webhook verification needs a secret', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'payment_link.paid', data: {} });
  const t = Math.floor(Date.now() / 1000);
  const forgedWithEmptyKey = `t=${t},v1=${createHmac('sha256', '').update(`${t}.${body}`).digest('hex')}`;

  for (const secret of ['', '   ']) {
    it(`refuses to verify with secret ${JSON.stringify(secret)}`, () => {
      expect(() => verifySignature(body, forgedWithEmptyKey, secret)).toThrow(BanzamiWebhookSignatureError);
      expect(() => constructEvent(body, forgedWithEmptyKey, secret)).toThrow(BanzamiWebhookSignatureError);
    });
  }
});
