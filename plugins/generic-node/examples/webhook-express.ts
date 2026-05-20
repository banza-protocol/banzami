// Run: ts-node examples/webhook-express.ts

import express              from 'express';
import { BanzaError }     from '../src/client';
import { parseWebhook }     from '../src/webhook';

const app    = express();
const secret = process.env.BANZAMI_WEBHOOK_SECRET!;

// IMPORTANT: use raw body for signature verification — do NOT use express.json() on this route
app.post('/webhooks/banzami', express.raw({ type: 'application/json' }), (req, res) => {
  const sig   = req.headers['x-banzami-signature'] as string;
  const event = parseWebhook(req.body, sig, secret);

  if (!event) {
    res.status(401).send('Invalid signature');
    return;
  }

  switch (event.type) {
    case 'transaction.completed': {
      const { id, reference } = event.payload as { id: string; reference: string };
      console.log(`Transaction ${id} completed — order ${reference}`);
      break;
    }
    case 'transaction.failed': {
      const { reference } = event.payload as { reference: string };
      console.log(`Transaction failed — order ${reference}`);
      break;
    }
    case 'payment_link.used': {
      const { id } = event.payload as { id: string };
      console.log(`Payment link ${id} was used`);
      break;
    }
    case 'payout.completed': {
      const { id } = event.payload as { id: string };
      console.log(`Payout ${id} completed`);
      break;
    }
  }

  res.status(200).send('OK');
});

app.listen(3000, () => console.log('Webhook server listening on :3000'));
