// Run: ts-node examples/node-webhook.ts

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual }                    from 'node:crypto';

const WEBHOOK_SECRET = process.env.BANZAMI_WEBHOOK_SECRET!;

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const expBuf   = Buffer.from(expected);
  const sigBuf   = Buffer.from(signature);
  if (expBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expBuf, sigBuf);
}

createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'POST' || req.url !== '/webhooks/banzami') {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const rawBody   = Buffer.concat(chunks);
    const signature = (req.headers['x-banzami-signature'] as string) ?? '';

    if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
      res.writeHead(401).end('Unauthorized');
      return;
    }

    const event = JSON.parse(rawBody.toString()) as { type: string; payload: unknown };

    switch (event.type) {
      case 'transaction.completed':
        console.log('Transaction completed:', event.payload);
        break;
      case 'transaction.failed':
        console.log('Transaction failed:', event.payload);
        break;
      case 'payment_link.used':
        console.log('Payment link used:', event.payload);
        break;
      default:
        console.log('Webhook received:', event.type, event.payload);
    }

    res.writeHead(200).end('OK');
  });
}).listen(3001, () => console.log('Listening on :3001'));
