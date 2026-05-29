# Doa × Banza — Official Reference Integration

> **This is the canonical Banza integration example.**
> Every API call, payload shape, webhook handler, and environment configuration shown here reflects the live production system.

> **SDK Migration Required.** Banza is an SDK-first platform ([ADR-012](../../adr/ADR-012-sdk-first-ecosystem.md)). The current direct `fetch()`-based implementation is transitional — it predates the TypeScript SDK reaching production readiness. Doa must migrate to `@banza/sdk` before this documentation is considered the complete canonical example. See [backend-integration.md](backend-integration.md#sdk-migration-target) for the migration target.

---

## What is Doa?

[Doa](https://doadoa.app) is an Angolan crowdfunding platform — a mobile-first donation platform where campaign owners share *vaquinhas* over WhatsApp and donors pay without creating an account. Donors complete OTP verification, choose a payment method, and receive a PDF receipt on mobile.

Doa is built on **Next.js 15** (App Router, TypeScript strict, Server Components) backed by **Supabase** (Postgres + Auth + RLS). The platform targets Angola as its primary market, which makes Banza the natural default payment method — both AOA-native, both built for the Angolan mobile experience.

---

## Why Doa is the Official Banza Example

Doa represents the full surface of what a serious Banza merchant integration looks like in production:

| Capability | Implementation |
|------------|----------------|
| Payment link creation | `POST /v1/payment-links` from a Next.js API route |
| QR-first payment UX | Client-side QR generation, step-by-step scan instructions |
| Real-time confirmation | Browser polling with idempotent status endpoint |
| Webhook processing | HMAC-SHA256 verified, replay-protected, idempotent |
| Sandbox isolation | `bz_test_` key detection, visual badge in UI |
| Structured observability | Request IDs, structured JSON logs, per-operation tracing |
| Idempotency | End-to-end: initiation, confirmation, receipt delivery |
| Production checklist | Full go-live procedure documented |

No part of this integration is mocked, stubbed, or simplified for demo purposes. Every code snippet in this documentation comes from the live production codebase.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Donor (browser / mobile)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Doa  (Next.js 15 on Vercel)                  │
│                                                                   │
│  Server Components    API Routes         Client Components        │
│  ─────────────────    ──────────────     ──────────────────────  │
│  Campaign page        /api/donations/    DonateFlow               │
│  Method picker        initiate-payment   BanzamiPanel (QR UI)    │
│  listPublicMethods()  banzami-status     Polling loop (3 s)      │
│                       /api/webhooks/                              │
│                       banzami           (HMAC-verified push)     │
└──────────────┬───────────────────────────────┬───────────────────┘
               │  Bearer bz_live_/bz_test_      │  Banza-Signature
               ▼                                ▼
┌──────────────────────────┐      ┌─────────────────────────────┐
│  Banzami API Gateway     │      │  Banzami Webhook Delivery   │
│  api.banzami.org         │      │  (push on payment_link.paid)│
│                          │      └─────────────────────────────┘
│  POST /v1/payment-links  │
│  GET  /v1/payment-links/ │
│        {id}              │
└──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  Banza Pay Page        │
│  pay.banzami.org/{slug}  │
│  (QR target — donor      │
│   scans with Banza app)│
└──────────────────────────┘
```

### Confirmation paths

Two paths both converge on the same idempotent ledger write:

```
Path A — Polling (active today)
  Browser polls GET /api/donations/banzami-status every 3 s
  → Doa fetches GET /v1/payment-links/{id} from Banzami
  → status = USED → applyPaymentEvent() → receipt → redirect

Path B — Webhook (active when BANZAMI_WEBHOOK_SECRET is set)
  Banzami pushes POST /api/webhooks/banzami on payment_link.paid
  → Doa verifies Banza-Signature
  → applyPaymentEvent() → receipt → redirect

Both paths call applyPaymentEvent() which deduplicates on
(intent_id, event_type, provider_ref) — no double-billing
regardless of which path wins the race.
```

---

## Payment Flow Overview

```
1.  Donor selects amount and completes OTP verification
2.  POST /api/donations/initiate-payment { provider_id: 'banzami' }
3.  Doa calls POST /v1/payment-links → gets { id, slug, status: 'ACTIVE' }
4.  Doa stores link.id as provider_ref in donation_events (payment_initiated)
5.  Doa returns { kind: 'inline', token: payUrl, provider_ref: linkId }
6.  BanzamiPanel renders QR from payUrl, starts polling loop
7.  Donor scans QR with Banza app and confirms payment
8.  Banzami marks link as USED
9.  Poll endpoint detects USED → applyPaymentEvent() → confirmed
10. Receipt generated and delivered, campaign totals revalidated
11. Browser redirects to /obrigado
```

---

## QR Flow Overview

```
pay.banzami.org/{slug}  ← URL encoded in QR
         │
         ▼
Donor opens Banza app → taps "Pagar" → scans QR
         │
         ▼
Banza app shows payment details (merchant, amount)
         │
         ▼
Donor confirms with PIN or biometrics
         │
         ▼
Payment link transitions: ACTIVE → USED
         │
         ▼
Doa polling detects USED within 3 s
```

---

## Sandbox Flow Overview

```
Set BANZAMI_API_KEY=bz_test_...
         │
         ▼
BanzamiProvider.sandbox = true
display_name = "Banzami (Sandbox)"
         │
         ▼
Doa routes to https://sandbox-api.banzami.org
Payment links are virtual — no real money
         │
         ▼
BanzamiPanel shows SANDBOX badge
         │
         ▼
Simulate payment via Banzami sandbox dashboard
or POST /v1/sandbox/simulate/payment
```

---

## Webhook Flow Overview

```
Register endpoint:
  POST /v1/webhooks/endpoints
  { url: 'https://doadoa.app/api/webhooks/banzami',
    events: ['payment_link.paid'] }
  → save returned secret as BANZAMI_WEBHOOK_SECRET

On payment:
  Banzami → POST /api/webhooks/banzami
  Headers: Banza-Signature: t=1716000000,v1=a1b2c3...
  Body: { id, type: 'payment_link.paid', data: { ...link } }

Doa:
  1. Read raw body (text — not parsed)
  2. Verify HMAC-SHA256(secret, "<t>.<raw_body>")
  3. Check |now - t| ≤ 300 s (replay protection)
  4. Parse body, extract data.id (= link_id = provider_ref)
  5. Look up intent_id from donation_events
  6. applyPaymentEvent() → idempotent
  7. Return 200
```

---

## Local Development Setup

### Prerequisites

- Node.js ≥ 20.11
- A Banza sandbox merchant account with `bz_test_` API key

### 1. Clone and install

```bash
git clone <doa-repo> doa && cd doa
npm install
cp .env.example .env.local
```

### 2. Configure Banza sandbox credentials

```env
BANZAMI_GATEWAY_URL=https://sandbox-api.banzami.org
BANZAMI_API_KEY=bz_test_your_sandbox_key
BANZAMI_MERCHANT_ID=your-test-merchant-uuid
BANZAMI_WALLET_ID=your-test-wallet-uuid
BANZAMI_PAY_BASE_URL=https://pay.banzami.org
PAYMENT_PROVIDERS=stripe,bank-transfer,banzami
```

### 3. Run

```bash
npm run dev
# Open http://localhost:3000/c/ajuda-maria-a3k9p2
# Navigate to Apoiar → complete OTP → choose Banzami
```

### 4. Simulate payment

In the Banza sandbox dashboard (`https://sandbox-dashboard.banzami.org`), find the payment link and click **Simulate Payment**. The Doa UI confirms within 3 seconds.

---

## Production Deployment

See [production-checklist.md](production-checklist.md) for the complete go-live procedure.

Key environment variables for production:

```env
BANZAMI_GATEWAY_URL=https://api.banzami.org
BANZAMI_API_KEY=bz_live_...
BANZAMI_MERCHANT_ID=<uuid>
BANZAMI_WALLET_ID=<uuid>
BANZAMI_WEBHOOK_SECRET=whsec_...
PAYMENT_PROVIDERS=stripe,bank-transfer,banzami
```

---

## Documentation Index

| Document | What it covers |
|----------|----------------|
| [architecture.md](architecture.md) | Full system design, boundaries, state machines |
| [payment-flow.md](payment-flow.md) | Complete lifecycle with every API call documented |
| [qr-payments.md](qr-payments.md) | QR generation, polling, mobile UX, expiration |
| [webhooks.md](webhooks.md) | HMAC verification, payload examples, retry handling |
| [sandbox.md](sandbox.md) | Sandbox setup, test simulation, environment isolation |
| [frontend-integration.md](frontend-integration.md) | React/Next.js UI architecture, QR panel, UX states |
| [backend-integration.md](backend-integration.md) | Provider interface, API client, idempotency, persistence |
| [security.md](security.md) | Threat model, secret handling, replay protection |
| [observability.md](observability.md) | Structured logging, request tracing, alerting |
| [production-checklist.md](production-checklist.md) | Go-live checklist with verification steps |
| [troubleshooting.md](troubleshooting.md) | Diagnostic procedures for common issues |
