# @banzami/sdk

Official TypeScript/JavaScript SDK for Banzami — wallet-native Kwanza payments,
built on the BANZA protocol.

> **Status.** The Public Sandbox is available and fully self-service, with fictitious
> money. Real-money operations remain unavailable and subject to the applicable regulatory,
> contractual and operational approvals.

This README is a short tour. The canonical documentation — guides, the API
reference, events, the error catalogue and the Sandbox scenarios — is at
**<https://developers.banzami.com/docs>**, and every TypeScript example there is
compiled against the published package.

All monetary values use **integer minor units**: for AOA, **1 Kz = 100 minor
units** (`amountMinor: 25_000` is 250 Kz). No floating-point arithmetic.

Requires Node.js ≥ 18 (native `fetch`). Secret keys (`bz_test_sk_…`) belong on your
server only; `@banzami/sdk/realtime` is the browser entry point, and it takes a
status token, never a key.

---

## Installation

```bash
npm install @banzami/sdk
```

---

## Quick start

1. Create an account, a Workspace and a Project in the Developer Console
   (<https://developers.banzami.com>). Choose the Project's use case: the Sandbox
   Financial Setup is ready at once, with no operator approval.
2. Create a Sandbox secret key (`bz_test_sk_…`) with the scopes you need.

```typescript
import { BanzamiClient } from '@banzami/sdk';

const banzami = new BanzamiClient({
  apiKey: process.env.BANZAMI_API_KEY!, // bz_test_sk_… — server only
});

const me = await banzami.me(); // { environment: 'SANDBOX', project, scopes, … }
```

Guide: <https://developers.banzami.com/docs/get-started>

---

## Environments & API keys

One developer platform, two financial environments. Every key carries its
environment in the prefix, so a key can never be used against the wrong one by
accident.

| Environment | Status | Money | Secret key | Publishable key |
|-------------|--------|-------|------------|-----------------|
| **Sandbox** | Available, self-service | Fictitious — simulated confirmations, failures, refunds | `bz_test_sk_…` | `bz_test_pk_…` |
| **Real-money operations** | Unavailable | — | `bz_live_sk_…` (refused) | `bz_live_pk_…` (refused) |

> Real-money operations remain unavailable and subject to the applicable regulatory,
> contractual and operational approvals. The API refuses `bz_live_…` keys today;
> the SDK keeps the `live` environment so an integration does not change shape
> when it opens.

Publishable keys (`…_pk_…`) are read-only and are the only keys a browser or
mobile app may hold. **Secret keys (`…_sk_…`) are backend-only — never ship them
in browser or mobile code.**

### Environment detection

The client resolves the environment in this order:

1. The explicit `environment` option, if provided.
2. The key prefix — `bz_test_…` → `sandbox`, `bz_live_…` → `live`.
3. The base URL, if it mentions `sandbox`.
4. Otherwise `live`.

If an explicit `environment` conflicts with the key prefix, the constructor
throws `BanzamiConfigError` before any request is made:

```typescript
// ✅ inferred from the key — no environment needed
new BanzamiClient({ apiKey: 'bz_test_sk_...' }); // → sandbox

// ✅ explicit and consistent
new BanzamiClient({ environment: 'sandbox', apiKey: 'bz_test_sk_...' });

// ❌ throws BanzamiConfigError:
//    "Banzami environment/key mismatch: live environment cannot use sandbox key…"
new BanzamiClient({ environment: 'live', apiKey: 'bz_test_sk_...' });
```

Keys without the `_sk_` segment are still classified by their `bz_test_` /
`bz_live_` prefix for environment detection.

### Authentication (API key → JWT)

The gateway is JWT-authenticated. The SDK handles this transparently: on the
first protected request it exchanges the raw API key at `POST /v1/auth/token`
for a short-lived JWT, caches it in memory, sends it as the `Bearer` token on
every request, refreshes it before expiry, and re-exchanges once on a `401`.
**The raw API key only ever hits the auth-exchange endpoint — never a protected
endpoint, and it is never logged.** A failed exchange throws `BanzamiAuthError`.

A Console-issued Developer Platform key (`bz_test_sk_…`) is itself the
credential: it is presented directly as the `Bearer` token and there is nothing
to exchange.

---

## Your Project: identity and financial readiness

```typescript
const me = await banzami.me();
// { environment: 'SANDBOX', project: { id, name, ref }, scopes, key_status }
// project.id is the Project's own id (as in the Console) and survives a rename.

const setup = await banzami.getFinancialSetup();
if (!setup.settlement.ready) {
  // Each blocker is the refusal a settlement would return, e.g.
  // FINANCIAL_SETUP_NOT_CONFIGURED, PRICING_NOT_CONFIGURED,
  // FEE_DESTINATION_TYPE_NOT_ALLOWED. Treat an unknown code as blocking.
  console.log(setup.settlement.blockers);
}
```

`getFinancialSetup()` reads with the key alone — nothing in the request names a
Project or account. The pricing it reports (`pricing.profile`,
`settlement_bps`, `payout_bps`) is assigned by Banzami; a settlement request
never carries a rate. `fee_destination.required` says whether that pricing
charges a fee at all; when it does not, the destination blocks nothing. Needs
the `identity:read` scope.

---

## Payment sessions (recommended)

A payment session is one payment intent with every way to pay it: a payment
link, a deep link and a QR — all crediting the same account.

```typescript
const session = await banzami.createPaymentSession({
  purpose:       'ORDER',
  referenceType: 'PEDIDO',
  referenceId:   'pedido_123',
  amountMinor:   25_000,        // 250 Kz
  currency:      'AOA',
  description:   'Pedido #123',
});

const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');
const qr   = banzami.paymentSessionInterface(session, 'DYNAMIC_QR');
link?.value; // "https://pay.banzami.com/pay/{slug}" — send it to the payer
qr?.value;   // the same pay URL — encode it into the QR you display
```

With a Developer Console key, omit `walletAccountId`: the payee comes from the
Project's binding, and a client-supplied payee is refused.

### Show the payer the status in real time (browser)

A session read with your key carries `realtime: { token, expires_at, path }` —
a read-only status token for that one session, valid for at most 30 minutes.
Give the token (never your key) to the page:

```typescript
import { watchPaymentSessionStatus } from '@banzami/sdk/realtime';

const watch = watchPaymentSessionStatus({
  sessionId: session.session_id,
  token:     session.realtime!.token,     // bzst_… — refused if it is an API key
  onStatus:  (s) => render(s.status),     // snapshot first, then every change
  onEnd:     (end) => console.log(end.reason), // terminal | token_expired | closed | error
});
// watch.close() when the page goes away.
```

It sends the token in the `Authorization` header over a fetch stream (never in
the URL) and reconnects from a fresh snapshot. It is for the screen, not proof
of payment: fulfil on the signed `payment_session.paid` webhook, or on a GET
your backend makes with its key.

---

## Sandbox test data

Sandbox keys only (`sandbox:read` / `sandbox:write`). A test payer belongs to
your Project, holds fictitious value, and pays only your Project's own sessions
and links — through this API; it signs in to no app.

```typescript
const { scenarios } = await banzami.listSandboxScenarios(); // every outcome and how to produce it

const payer = await banzami.createTestPayer({ label: 'Maria (teste)' }); // starts with 10 000 Kz
await banzami.fundTestPayer(payer.id, { amountMinor: 500_000, idempotencyKey: 'fund-1' });

const paid = await banzami.payAsTestPayer(payer.id, {
  paymentSessionId: session.session_id,
  via:              'QR',               // or 'LINK' (default)
  idempotencyKey:   'pay-1',
});
paid.status;          // 'PAID'
paid.proof_reference; // a receipt that verifies publicly

// External-rail outcomes are asked for explicitly, never by a magic amount:
await banzami.payAsTestPayer(payer.id, { paymentSessionId: other.session_id, simulate: 'DECLINED' });
// simulate: 'TIMEOUT' pays, answers 503 SANDBOX_SIMULATED_TIMEOUT, and the SDK's retry with the same key returns the real result.
// simulate: 'DELAYED' answers PENDING at once; the payment completes on its own ~10 s later (webhook, realtime stream, or repeat with the same key).
const pending = await banzami.payAsTestPayer(payer.id, { paymentSessionId: later.session_id, simulate: 'DELAYED', idempotencyKey: 'pay-later' });
pending.status; // 'PENDING'

await banzami.retireTestPayer(payer.id); // its value is retired by a balanced posting
```

---

## Payment links

A reusable URL to share. With a project key, send no `merchantId` and no
`walletId`: who is paid comes from the Project's Financial Setup, and the API
refuses a request that names a payee (`400 PAYEE_NOT_ALLOWED`).

```typescript
const link = await banzami.createPaymentLink({
  amountMinor: 25_000,          // 250 Kz; omit for an open amount
  currency:    'AOA',
  description: 'Pedido #123',
});
link.slug; // the payer opens https://pay.banzami.com/pay/{slug}

const page = await banzami.listPaymentLinks({ limit: 20 });
await banzami.cancelPaymentLink(link.id);
```

`banzami.paymentLinkQr(link)` returns the canonical QR payload for a link — encode
it as-is rather than building one.

---

## Refunds

```typescript
const session = await banzami.getPaymentSession('psess_…');
if (!session.refund_source) throw new Error('the session has not been paid');

const refund = await banzami.createRefund({
  source_type:     session.refund_source.source_type,
  source_id:       session.refund_source.source_id,
  amount_minor:    5_000,                    // 50 Kz — partial
  currency:        'AOA',
  idempotency_key: 'refund-order-123',       // required, and stored before the call
  reason:          'Item out of stock',
});
refund.status; // 'SUCCEEDED'
```

A refund never exceeds what was captured: the next one answers
`422 REFUND_EXCEEDS_CAPTURED`. Guide: <https://developers.banzami.com/docs/refunds>

---

## Webhooks

```typescript
const banzami = new BanzamiClient({ apiKey, webhookSecret: process.env.BANZAMI_WEBHOOK_SECRET });

// Register an endpoint (the secret is returned once).
const ep = await banzami.createWebhookEndpoint({
  url:    'https://www.example.com/api/webhooks/banzami',
  events: ['payment_session.paid'],
});

// In the receiver: the raw body and the banza-signature header.
const event = banzami.webhooks.constructEvent(rawBody, signatureHeader); // throws if the signature is wrong
if (event.type === 'payment_session.paid') { /* fulfil, idempotently */ }

// In the Sandbox: a signed, synthetic webhook.test event that moves nothing
// (10 test deliveries a minute per endpoint).
const test = await banzami.sendWebhookTestEvent(ep.id);
const deliveries = await banzami.listWebhookDeliveries(test.event_id); // attempts, status, latency
```

Delivery is at-least-once with no ordering guarantee; answer `2xx` quickly.
Guide: <https://developers.banzami.com/docs/webhooks>

---

## Errors

Every API error is a `BanzamiApiError` with `.status` (HTTP), `.code` (for example
`PAYMENTS_UNAVAILABLE`, `REFUND_EXCEEDS_CAPTURED`). Branch on `.code`; treat a code you do not know as a failure. The full list, route
by route, is the error catalogue: <https://developers.banzami.com/docs/errors>

```typescript
import { BanzamiApiError } from '@banzami/sdk';

try {
  await banzami.createPaymentSession({ /* … */ } as never);
} catch (err) {
  if (err instanceof BanzamiApiError && err.code === 'PAYMENTS_UNAVAILABLE') {
    // the Project's Financial Setup is not ready — see getFinancialSetup()
  }
}
```

---

## Other methods

The client also carries methods for merchant and consumer credentials used by
Banzami's own apps (transactions, payouts, disputes, structured QR, API keys by
merchant). A Developer Console project key does not use them; the API reference
lists exactly what a project key can call:
<https://developers.banzami.com/docs/reference>

---

## Money utilities

```typescript
import { formatMinor, addMinor, subtractMinor } from '@banzami/sdk/money';

formatMinor(5_000_000, 'AOA'); // "50 000 Kz"   (minor units are cêntimos)
formatMinor(5_000_050, 'AOA'); // "50 000,50 Kz"
formatMinor(1099,   'USD');  // "USD 10.99"

addMinor(10_000, 5_000);     // 15000
subtractMinor(10_000, 3000); // 7000
```

---

## Theme tokens (web/Tailwind)

```typescript
import { colors, tailwindTokens, cssVariables } from '@banzami/sdk/theme';

// In tailwind.config.ts:
export default {
  theme: {
    extend: tailwindTokens,
  },
};
```

---

## Development

```bash
# Build
npm run build

# Type-check only (no emit)
npm run typecheck

# Tests (vitest)
npm test

# Tests in watch mode
npm run test:watch
```

---

## Licence

The `@banzami/sdk` **client code in this package** is licensed under the
[MIT licence](./LICENSE).

That grant is deliberately narrow, and covers this package only:

- **Use of the Banzami hosted service and API** — creating payment sessions,
  moving money, receiving webhooks — remains governed by the Banzami terms of
  service and your operator agreement. Installing this package does not grant
  access to the service, and does not licence the Banzami platform, backend,
  Developer Platform, infrastructure, or documentation.
- **The BANZA protocol** is governed separately by the BANZA protocol project.
  It is not relicensed by this package.
- **No trademark rights.** The MIT licence does not grant any right to use the
  Banzami or BANZA names, logos, or branding. See the brand guidance in the
  developer documentation before referring to Banzami in your product.
