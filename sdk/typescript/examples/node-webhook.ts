/**
 * Banzami Webhook Handler — Node.js example
 *
 * Uses `banzami.webhooks.constructEvent()` which handles:
 *   - Banza-Signature header parsing (t=<unix>,v1=<hex>)
 *   - HMAC-SHA256 verification with timestamp in the signed payload
 *   - 300-second replay-attack protection window
 *   - Constant-time comparison
 *
 * Run: ts-node examples/node-webhook.ts
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { BanzaClient, BanzamiWebhookSignatureError, SIGNATURE_HEADER } from '../src/index.js';
import type { WebhookEvent } from '../src/index.js';

const banzami = new BanzaClient({
  apiKey:        process.env.BANZA_API_KEY!,
  webhookSecret: process.env.BANZA_WEBHOOK_SECRET!,
});

createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'POST' || req.url !== '/webhooks/banzami') {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const rawBody        = Buffer.concat(chunks);
    // Header name lookup is case-insensitive in Node.js; the canonical name is
    // SIGNATURE_HEADER = 'Banza-Signature'.
    const signatureHeader = (req.headers[SIGNATURE_HEADER.toLowerCase()] as string) ?? '';

    let event: WebhookEvent;
    try {
      event = banzami.webhooks.constructEvent(rawBody, signatureHeader);
    } catch (err) {
      if (err instanceof BanzamiWebhookSignatureError) {
        console.error('Webhook verification failed:', err.message);
        res.writeHead(401).end('Unauthorized');
      } else {
        console.error('Unexpected error processing webhook:', err);
        res.writeHead(500).end('Internal Server Error');
      }
      return;
    }

    switch (event.type) {
      case 'payment_link.paid':
        console.log('Payment link paid:', event.data);
        break;
      case 'transaction.completed':
        console.log('Transaction completed:', event.data);
        break;
      case 'transaction.failed':
        console.log('Transaction failed:', event.data);
        break;
      case 'payout.created':
        console.log('Payout created:', event.data);
        break;
      case 'payout.completed':
        console.log('Payout completed:', event.data);
        break;
      case 'payout.failed':
        console.log('Payout failed:', event.data);
        break;
      default:
        console.log('Unhandled webhook event:', event.type, event.data);
    }

    res.writeHead(200).end('OK');
  });
}).listen(3001, () => console.log('Listening on :3001'));
