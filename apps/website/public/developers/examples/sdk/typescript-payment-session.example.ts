// Banzami — create a payment session with the published TypeScript SDK.
//
//   npm install @banzami/sdk
//
// Sandbox only; placeholders only. Compiled against @banzami/sdk from npm by
// tools/check-docs-code-examples.mjs, so this file cannot drift from the SDK.
import { BanzamiClient, BanzamiApiError } from '@banzami/sdk';

// The secret test key (bz_test_sk_…) lives ONLY on the server.
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// 1. Who am I? Environment, project, scopes and key status — no money involved.
const me = await banzami.me();
console.log(me.environment); // 'SANDBOX'

// 2. Can this project be paid? Without financial setup a payment is 403 PAYMENTS_UNAVAILABLE.
const setup = await banzami.getFinancialSetup();
if (!['READY', 'SEALED'].includes(setup.financial_setup.state)) {
  throw new Error('complete financial setup in the Console first');
}

// 3. Create the payment. Who is paid comes from financial setup — never from this request.
//    The SDK sends an Idempotency-Key and retries 429/502/503/504 with the same key.
try {
  const session = await banzami.createPaymentSession({
    purpose: 'ORDER',
    referenceType: 'ORDER',
    referenceId: 'order_123',
    amountMinor: 250000, // 2 500 Kz — 100 minor units = 1 Kz
    currency: 'AOA',
    description: 'Order #123',
  });
  const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');
  console.log(session.session_id, session.status, link?.value); // psess_…, 'ACTIVE', https://pay.banzami.com/pay/…
} catch (err) {
  // Branch on the code, never on the message; keep the request id for support.
  if (err instanceof BanzamiApiError) console.error(err.status, err.code);
  throw err;
}
