# Doa × Banzami — Integration Architecture

---

## System Boundaries

The Doa integration sits entirely within the **merchant application** tier. Doa is the merchant. Banzami is the payment infrastructure. The boundary between them is the Banzami API.

```
┌─────────────────────────────────────────────────────────────────────┐
│  MERCHANT APPLICATION (Doa)                                          │
│                                                                       │
│  ┌─────────────────────┐   ┌──────────────────────────────────────┐ │
│  │  Frontend           │   │  Backend (Next.js Server / API Routes)│ │
│  │  (React, browser)   │   │                                      │ │
│  │                     │   │  BanzaProvider.initiate()          │ │
│  │  BanzaPanel       │   │  → POST /v1/payment-links            │ │
│  │  QR display         │   │                                      │ │
│  │  Polling loop       │   │  banzami-status route                │ │
│  │  Sandbox badge      │   │  → GET  /v1/payment-links/{id}       │ │
│  │                     │   │                                      │ │
│  │                     │   │  /api/webhooks/banzami               │ │
│  └─────────────────────┘   │  → HMAC verify + applyPaymentEvent() │ │
│                             └──────────────────────────────────────┘ │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │  Bearer bz_live_/bz_test_
                          ─────────────┼──────────────────────────
                          BANZAMI API  │
                                       ▼
                          ┌────────────────────────┐
                          │  api.banzami.org        │
                          │                         │
                          │  POST /v1/payment-links │
                          │  GET  /v1/payment-links │
                          │        /{id}            │
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  Banzami Core (Rust)     │
                          │                         │
                          │  Payment link FSM       │
                          │  ACTIVE → USED          │
                          │  Ledger write on USED   │
                          │  Webhook dispatch       │
                          └─────────────────────────┘
```

---

## Frontend Responsibilities

The Doa frontend (React, browser) owns:

- Rendering the `BanzaPanel` component when the donor selects Banzami
- Generating the QR image client-side from the pay URL
- Running the polling loop (calls `/api/donations/banzami-status` every 3 s)
- Displaying the sandbox badge when `provider.sandbox = true`
- Showing confirmation animation and triggering redirect on success

The frontend never calls Banzami's API directly. All Banzami API calls go through Doa's Next.js API routes.

### Why client-side QR generation?

The QR image (~6 kB data URL) is only needed when the donor reaches the Banzami stage. Generating it server-side would require either passing the data URL through the page props (wasting SSR time on a conditional flow) or a separate API call. Dynamic import of the `qrcode` library (~50 kB) defers that cost entirely — it downloads only when the donor actually reaches the QR panel.

---

## Backend Responsibilities

The Doa backend (Next.js API routes) owns:

- **Initiation**: Creating payment links via `POST /v1/payment-links`
- **Status**: Proxying link status checks to Banzami
- **Webhooks**: Receiving, verifying, and processing push events from Banzami
- **Persistence**: Writing immutable events to `donation_events`
- **Receipt delivery**: Generating and delivering PDF receipts
- **Cache invalidation**: Revalidating the campaign page after confirmation

The backend holds all Banzami credentials. They never reach the browser.

---

## Payment State Flow

Doa maintains payment state in an **append-only event log** (`donation_events`). State is derived from events — there is no mutable `status` column that gets updated.

```
donation_intent created
       │
       ▼
[event: payment_initiated]
  payload: { provider: 'banzami', provider_ref: 'lnk_...', initiate: {...} }
       │
       ▼
Donor pays in Banza app
       │
       ├── Poll path: banzami-status detects USED
       │         ─OR─
       └── Webhook path: Banzami pushes payment_link.paid
       │
       ▼
[event: payment_confirmed]
  payload: { provider_ref: 'lnk_...', amount: '150000', currency: 'AOA', paid_at: '...' }
       │
       ▼
[receipt generated and delivered]
[campaign page revalidated]
```

**Deduplication key**: `(intent_id, event_type, provider_ref)`. If both the poll path and the webhook path fire simultaneously, the second write is a no-op.

---

## Environment Isolation Architecture

Doa detects the environment from the API key prefix:

```typescript
const IS_SANDBOX = API_KEY.startsWith('bz_test_');

class BanzaProvider implements PaymentProvider {
  readonly sandbox      = IS_SANDBOX;
  readonly display_name = IS_SANDBOX ? 'Banza (Sandbox)' : 'Banza';
  readonly available    = !!(GATEWAY_URL && API_KEY && MERCHANT_ID && WALLET_ID);
}
```

This detection happens at module initialization time. The `sandbox` field is propagated from:

```
BanzaProvider.sandbox
    → listPublicMethods() → PaymentMethodMeta.sandbox
    → DonateFlow props.methods[].sandbox
    → submitMethod() → setBanzamiSandbox(true)
    → BanzaPanel isSandbox={true}
    → "SANDBOX" badge rendered
```

The badge is purely informational — it does not change any API behavior. The API key prefix is the actual gate.

---

## API Client Architecture

> **Transitional implementation.** Banzami is an SDK-first platform ([ADR-012](../../adr/ADR-012-sdk-first-ecosystem.md), CLAUDE.md §14). The current direct `fetch()` implementation is a transitional state from before the TypeScript SDK reached production readiness. Doa must migrate to the official Banzami TypeScript SDK — see the [SDK Migration](#sdk-migration) section below.

The current (transitional) implementation uses direct `fetch()` calls from two server-only files:

```
lib/payments/providers/banzami.ts    ← initiation (POST /v1/payment-links)
app/api/donations/banzami-status/    ← status check (GET /v1/payment-links/{id})
```

Both files use `import 'server-only'` (Next.js compiler directive) to enforce that credentials never reach the browser. The module boundary is enforced at build time — importing either file from a `'use client'` component causes a build error.

### SDK Migration

The target architecture after SDK migration:

```typescript
// lib/payments/providers/banzami.ts — after migration
import { BanzaClient } from '@banza/sdk';

const banzami = new BanzaClient({ apiKey: process.env.BANZA_API_KEY });
// banzami.isSandbox → true when bz_test_ key — replaces IS_SANDBOX detection

// Payment link creation
const link = await banzami.paymentLinks.create({
  merchantId:  MERCHANT_ID,
  walletId:    WALLET_ID,
  amount:      { minor: input.amount, currency: 'AOA' },
  description: `DOA-${input.intent_id.slice(0, 8).toUpperCase()}`,
  idempotencyKey: `banzami:${input.intent_id}`,
});

// Webhook verification
const event = await banzami.webhooks.constructEvent(rawBody, sigHeader);
```

The SDK provides:
- automatic environment routing (`bz_test_` → sandbox gateway, `bz_live_` → live gateway)
- built-in idempotency key management and reuse across retries
- exponential backoff on `429`/`5xx` responses
- typed response models — no manual `as BanzaPaymentLink` casts
- `banzami.webhooks.constructEvent()` — replaces the manual `verifySignature()` implementation
- `banzami.isSandbox` — replaces the `API_KEY.startsWith('bz_test_')` detection

---

## Webhook Boundary

```
                         Internet
                            │
               Banza-Signature: t=...,v1=...
                            │
                            ▼
               POST /api/webhooks/banzami
                            │
                    ┌───────┴────────┐
                    │ Verify HMAC    │ ← WEBHOOK_SECRET in env
                    │ Check replay   │ ← |now - t| ≤ 300 s
                    └───────┬────────┘
                            │ 401 on failure
                            ▼
                    ┌───────┴────────┐
                    │ Parse JSON     │
                    │ Check type     │ ← unknown types → 200 + ignored
                    └───────┬────────┘
                            │
                            ▼
                    ┌───────┴────────────────────┐
                    │ Resolve intent_id           │
                    │ via JSONB lookup in         │
                    │ donation_events             │
                    └───────┬────────────────────┘
                            │ 200 + ignored if not found
                            ▼
                    ┌───────┴────────┐
                    │ applyPayment   │ ← idempotent
                    │ Event()        │
                    └───────┬────────┘
                            │ 500 on DB error → Banzami retries
                            ▼
                    ┌───────┴────────┐
                    │ Receipt        │ ← async, non-blocking
                    │ Cache inval.   │
                    └───────┬────────┘
                            │
                            ▼
                       200 OK
```

---

## QR Payment Orchestration

```
BanzaProvider.initiate()
    │
    └─► POST /v1/payment-links
        { merchant_id, wallet_id, amount_minor, currency, description }
        ↓
        { id: 'lnk_...', slug: 'abc123', status: 'ACTIVE', ... }
        ↓
        payUrl = BANZAMI_PAY_BASE_URL + '/' + slug
        provider_ref = id

BanzaPanel mounts:
    │
    ├─► Dynamic import('qrcode') → generate QR from payUrl
    │
    └─► setInterval(3000ms):
            GET /api/donations/banzami-status?intent_id=X&link_id=Y
                │
                └─► GET /v1/payment-links/{Y}
                    status = ACTIVE → { confirmed: false }
                    status = USED   → applyPaymentEvent()
                                   → { confirmed: true }

On confirmed:
    clearInterval()
    show success animation (1.2 s)
    redirect to /obrigado
```

---

## Idempotency Architecture

Three independent idempotency layers protect the payment lifecycle:

| Layer | Key | Mechanism |
|-------|-----|-----------|
| Payment link creation | `banzami:{intent_id}` | Checked in `donation_events` before calling API — replay returns existing initiate result |
| Confirmation recording | `(intent_id, payment_confirmed, provider_ref)` | Dedup query in `applyPaymentEvent()` — second call returns `{ deduped: true }` |
| Receipt delivery | `intent_id` | Idempotency key passed to `generateAndDeliverReceipt()` — no duplicate emails/SMS |

The polling loop and webhook path both hit the same dedup layer. The first write records the event; all subsequent writes are no-ops.
