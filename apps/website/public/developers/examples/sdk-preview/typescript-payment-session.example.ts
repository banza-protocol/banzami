// Banzami SDK preview example.
// This is SDK-style documentation, not a public install path.
// Do not run npm install @banzami/sdk until official packages are published.
//
// illustrative SDK-style API — intended ergonomics (controlled preview).
// Placeholders only; never real keys. Sandbox/Preview scope; no real money.
// @ts-nocheck — pseudocode: this file is documentation, it does not compile.

// The secret test key lives ONLY on the server.
const banzami = BanzamiClient.preview({ apiKey: process.env.BANZAMI_API_KEY /* bz_test_sk_XXXX */ });

// Expected contract: verify the key first (identity, no financial state).
const me = await banzami.me();
// -> { environment: 'SANDBOX', project: 'my-project', scopes: ['identity:read'], key_status: 'ACTIVE' }

// Expected contract: create a payment session — the SDK manages the
// Idempotency-Key (or accepts an explicit caller-provided one).
const session = await banzami.paymentSessions.create(
  {
    walletAccountId: 'wacc_xxx',
    purpose: 'ORDER',
    referenceType: 'PEDIDO',
    referenceId: 'order_123',
    amountMinor: 25000, // minor units (AOA)
    currency: 'AOA',
    description: 'Order #123',
  },
  { idempotencyKey: 'idem_xxx' },
);

// Expected contract: canonical error mapping + request_id exposure.
// try { ... } catch (err) { err.code === 'VALIDATION_ERROR'; err.requestId === 'req_xxx'; }

// Expected contract: webhook signature verification helper (banza-signature).
// const event = banzami.webhooks.constructEvent(rawBody, signatureHeader);
