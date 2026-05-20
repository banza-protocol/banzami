import { BanzaClient } from './client.js';

export interface WebhookEvent {
  type:    string;
  payload: Record<string, unknown>;
}

/**
 * Express/Fastify middleware helper for Banzami webhooks.
 *
 * Express usage (requires express.raw() body parser for this route):
 * ```ts
 * import express from 'express';
 * import { parseWebhook } from '@banza/node/webhook';
 *
 * app.post('/banzami/webhook', express.raw({ type: '*\/*' }), (req, res) => {
 *   const event = parseWebhook(req.body, req.headers['x-banzami-signature'], process.env.BANZAMI_WEBHOOK_SECRET!);
 *   if (!event) { res.status(401).send('Bad signature'); return; }
 *
 *   if (event.type === 'payment_link.used') { ... }
 *   res.send('OK');
 * });
 * ```
 */
export function parseWebhook(
  rawBody:   Buffer | string,
  signature: string | string[] | undefined,
  secret:    string,
): WebhookEvent | null {
  const sig = Array.isArray(signature) ? signature[0] : (signature ?? '');

  if (!BanzaClient.verifyWebhook(rawBody, sig, secret)) {
    return null;
  }

  try {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    return JSON.parse(body) as WebhookEvent;
  } catch {
    return null;
  }
}
