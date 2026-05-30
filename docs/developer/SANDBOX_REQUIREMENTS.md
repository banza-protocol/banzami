# BANZA — Sandbox Requirements

**Mission:** BANZA-FIRST-100-BUILDERS-001  
**Scope:** Complete specification of what the sandbox environment must provide to enable zero-friction self-directed builder adoption  
**Date:** 2026-05-30  
**Status:** Official

---

## Guiding Principle

The sandbox must allow a developer to complete the full quickstart — including a simulated end-to-end payment — without any of the following:

- A legal business entity
- KYC documentation
- A phone number
- A conversation with anyone at BANZA
- Access to the production dashboard

Everything that requires human approval or business verification belongs at the point of going live — not at the point of exploration.

---

## Current State

| Capability | Available Now | Gap |
|-----------|--------------|-----|
| Separate API URL (`sandbox-api.banzami.com`) | ✓ | — |
| Separate database (no data mixing) | ✓ | — |
| API key prefix signal (`bz_test_`) | ✓ | — |
| `GET /v1/sandbox/status` | ✓ | — |
| `POST /v1/sandbox/fund` (fund a wallet with virtual Kz) | ✓ | — |
| Self-service key issuance (email → key in 60s, no KYC) | ✗ | **Critical** |
| Pre-seeded consumer demo wallet (`wlt_sandbox_consumer_demo`) | ✗ | **Critical** |
| `POST /v1/sandbox/simulate/qr-payment` | ✗ | **Critical** |
| `POST /v1/sandbox/simulate/p2p-transfer` | ✗ | High |
| `POST /v1/sandbox/simulate/payment-link-paid` | ✗ | High |
| Webhook delivery to localhost tunnels | ✓ (works) | Docs gap |
| Rate limits (sandbox, developer-friendly) | Unknown | Needs definition |
| Sandbox account reset (`DELETE /v1/sandbox/reset`) | ✗ | Medium |
| Per-event webhook log (inspect delivered events) | ✗ | Medium |
| Sandbox event inspector in dashboard | ✗ | Low |

---

## Required: Sandbox Sign-Up Without KYC

### Endpoint

```
POST /v1/sandbox/signup
Content-Type: application/json

{
  "email": "developer@example.com"
}
```

### Response

```json
{
  "success": true,
  "message": "Your sandbox credentials will arrive by email within 30 seconds."
}
```

### Email delivered within 30 seconds

**Subject:** Your BANZA sandbox is ready

**Body:**

```
Your BANZA sandbox credentials

API Key:
  bz_test_a1b2c3d4e5f6g7h8i9j0k1l2

Merchant ID:
  mch_sandbox_a1b2c3d4

Wallet ID:
  wlt_sandbox_e5f6g7h8

Pre-seeded consumer wallet (for testing payments):
  wlt_sandbox_consumer_demo
  Balance: 500 Kz (auto-restored if depleted)

Sandbox API base URL:
  https://sandbox-api.banzami.com

Get started:
  https://banzami.com/docs/quickstart
```

### Implementation notes

- Email delivery must be ≤ 30 seconds (SendGrid / Postmark / SES — not transactional batch queue)
- The key is issued by the sign-up endpoint, not the email. Email delivery fails → resend endpoint.
- Rate limit: max 3 sign-ups per email address per 24 hours
- The sandbox merchant and wallet are created on-demand when the sign-up request is processed
- No password is set at this stage. If the developer wants to access the sandbox dashboard, they receive a magic link via `POST /v1/sandbox/magic-link` with their email

### What this does NOT replace

This sandbox sign-up flow is for developer exploration only. Going to production requires the full merchant onboarding flow (KYC, business registration, bank account linking). The sandbox key is permanently environment-locked to sandbox — it can never be promoted to live.

---

## Required: Pre-Seeded Sandbox Resources

Every sandbox account (and the shared demo environment) must have the following pre-created:

### Shared sandbox fixtures (same for all accounts)

These are not per-developer — they are global sandbox fixtures that every developer's sandbox key can reference:

| Resource | ID | State |
|----------|-----|-------|
| Consumer demo wallet | `wlt_sandbox_consumer_demo` | Funded with 50,000 minor units (500 Kz). Auto-tops up to 50,000 if balance drops below 10,000. |
| Consumer demo handle | `@sandbox_consumer` | Resolved by `getConsumerByHandle('sandbox_consumer')` |
| Static QR (merchant demo) | `qr_sandbox_static_demo` | Always active. Use for scanning tests. |

### Per-developer sandbox fixtures (created at sign-up)

| Resource | ID pattern | State |
|----------|-----------|-------|
| Merchant account | `mch_sandbox_<8-char>` | Active, no KYC required |
| Merchant wallet | `wlt_sandbox_<8-char>` | Funded with 100,000 minor units (1,000 Kz) |
| Static QR for merchant | Auto-generated | Linked to merchant wallet |

### Balance restoration policy

Sandbox balances never block a developer permanently:
- `wlt_sandbox_consumer_demo`: Auto-topped up to 50,000 when below 10,000
- Developer merchant wallet: Can call `POST /v1/sandbox/fund` at any time to add up to 1,000,000 minor units per 24 hours

---

## Required: Sandbox Simulation Endpoints

These endpoints allow a developer to simulate payment events from the consumer side without building a second application.

### `POST /v1/sandbox/simulate/qr-payment`

Simulates a consumer scanning and paying a QR code.

**Request:**
```json
{
  "qr_id":            "qr_a1b2c3d4",
  "consumer_wallet_id": "wlt_sandbox_consumer_demo"
}
```

**Response:**
```json
{
  "status":         "COMPLETED",
  "transaction_id": "txn_x9y8z7",
  "amount_minor":   5000,
  "trace_id":       "trc_abc123",
  "ledger_entries": 2
}
```

**SDK surface:**
```typescript
const result = await banza.sandbox.simulateQrPayment({
  qrId:             'qr_a1b2c3d4',
  consumerWalletId: 'wlt_sandbox_consumer_demo',
});
// result.status === 'COMPLETED'
```

**Error cases:**
- `QR_NOT_FOUND` — qr_id does not exist
- `QR_EXPIRED` — QR has passed its `expires_at`
- `QR_ALREADY_USED` — dynamic QR has already been paid
- `INSUFFICIENT_FUNDS` — consumer wallet has insufficient balance
- `NOT_SANDBOX` — this endpoint is not available in production (returns 404)

---

### `POST /v1/sandbox/simulate/p2p-transfer`

Simulates a P2P transfer from the demo consumer to any handle.

**Request:**
```json
{
  "from_wallet_id": "wlt_sandbox_consumer_demo",
  "to_handle":      "@merchant_demo",
  "amount_minor":   10000
}
```

**Response:**
```json
{
  "status":      "COMPLETED",
  "transfer_id": "trf_abc123",
  "trace_id":    "trc_def456"
}
```

**SDK surface:**
```typescript
const result = await banza.sandbox.simulateP2PTransfer({
  fromWalletId: 'wlt_sandbox_consumer_demo',
  toHandle:     '@merchant_demo',
  amountMinor:  10000,
});
```

---

### `POST /v1/sandbox/simulate/payment-link-paid`

Simulates a consumer paying a payment link.

**Request:**
```json
{
  "link_slug":      "abc123",
  "consumer_wallet_id": "wlt_sandbox_consumer_demo"
}
```

**Response:**
```json
{
  "status": "PAID",
  "transaction_id": "txn_xyz",
  "trace_id": "trc_abc"
}
```

This simulation also triggers the webhook delivery for `payment_link.paid` if the merchant has a webhook endpoint configured.

---

## Required: Webhook Delivery in Sandbox

Webhooks are delivered in sandbox to whatever endpoint the developer has registered via `POST /v1/merchants/{id}/webhook-endpoints`.

### Localhost webhook development

The quickstart documentation must include setup for local webhook testing:

```bash
# Option 1: cloudflare tunnel (free, no account required)
npx cloudflare tunnel --url http://localhost:3001

# Option 2: localtunnel (free, no account required)
npx localtunnel --port 3001

# The tunnel URL (e.g. https://abc123.trycloudflare.com) is registered as the webhook endpoint
```

### Sandbox webhook delivery guarantees

| Property | Sandbox | Production |
|----------|---------|------------|
| Delivery attempts | Up to 5 | Up to 10 |
| Retry intervals | 5s, 30s, 2m, 10m, 1h | 5s, 30s, 2m, 10m, 1h, 6h, 24h |
| Signature | Banza-Signature header, same format as production | Same |
| Replay on demand | `POST /v1/sandbox/webhooks/replay/{event_id}` | Not available |
| Event log | `GET /v1/sandbox/webhooks/events` | Not in sandbox-only form |

The `POST /v1/sandbox/webhooks/replay/{event_id}` endpoint is sandbox-only and allows a developer to re-deliver any previously delivered event. This is critical for webhook handler development — a developer can trigger an event once and replay it as many times as needed while writing the handler.

---

## Required: Sandbox Rate Limits

Sandbox rate limits must be developer-friendly. The goal is to never block a developer during active development.

| Limit | Sandbox | Production |
|-------|---------|------------|
| Requests per minute (per key) | 600 | 200 |
| QR codes per hour | 1,000 | 500 |
| Simulation calls per hour | 1,000 | N/A |
| Webhook endpoint registrations | 20 | 10 |
| Fund endpoint calls per 24h | 100 | N/A |
| Max fund amount per call | 10,000,000 minor units | N/A |

Rate limit headers must be present in every response:
```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 598
X-RateLimit-Reset: 1748620800
```

When a rate limit is hit, the response is:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Retry after 2026-05-30T14:00:00Z",
  "retry_after": "2026-05-30T14:00:00Z"
}
```

The `BanzaApiError` SDK class has `isRateLimit: boolean` property that maps to this error code.

---

## Optional: Sandbox Account Reset

Allows a developer to wipe their sandbox and start fresh. Useful for integration testing.

```
DELETE /v1/sandbox/reset
Authorization: Bearer <token>
```

**Effect:** Deletes all transactions, QR codes, payment links, and webhook events for this sandbox account. Preserves: merchant account, wallet (with 100,000 minor unit balance restored), API keys.

This is a destructive operation with a 5-second delay before execution, returning a confirmation token that must be re-submitted to confirm.

---

## Optional: Sandbox Event Inspector

A read-only API (and eventual dashboard tab) that shows:

```
GET /v1/sandbox/events?limit=50
```

Returns the last 50 events in the developer's sandbox, with type, timestamp, payload, and delivery status if a webhook is registered.

This eliminates the need to `console.log` inside the webhook handler during development — the developer can inspect what was delivered without modifying their handler code.

---

## Sandbox Environment Documentation

The existing `docs/sandbox/README.md` and `docs/sandbox/sandbox-vs-production.md` cover the architecture well. What they do not cover:

1. **How to get a key without the dashboard** — the self-service sign-up flow (add to README)
2. **How to use the simulation endpoints** — add a "Simulating payments" section
3. **How to set up local webhook testing** — add a "Testing webhooks locally" section with cloudflare/localtunnel examples
4. **How to reset** — add "Resetting sandbox state" section
5. **What the pre-seeded resources are** — add "Pre-seeded test data" table

---

## Acceptance Criteria

The sandbox is ready to support first 100 builders when:

| Criterion | Verification |
|-----------|-------------|
| `POST /v1/sandbox/signup` exists and delivers key within 30s | Test with new email address |
| `wlt_sandbox_consumer_demo` exists and has balance in all new sandboxes | Create new account, call `getWalletBalance('wlt_sandbox_consumer_demo')` |
| `POST /v1/sandbox/simulate/qr-payment` works end-to-end | Run the quickstart payment.ts and see `COMPLETED` |
| The simulation triggers webhook delivery | Register a webhook endpoint, simulate a payment, see event delivered |
| Sandbox key issuance requires no human approval | Entire flow automated, no BANZA team involvement |
| Rate limits are 600 req/min per key | Load test confirms |
| `POST /v1/sandbox/webhooks/replay/{event_id}` works | Deliver event, replay, confirm second delivery |

---

*Part of BANZA-FIRST-100-BUILDERS-001 — 2026-05-30*  
*Related: [FIRST_BUILDER_JOURNEY.md](FIRST_BUILDER_JOURNEY.md) · [15_MINUTE_QUICKSTART_SPEC.md](15_MINUTE_QUICKSTART_SPEC.md) · [SDK_ADOPTION_PLAN.md](SDK_ADOPTION_PLAN.md)*
