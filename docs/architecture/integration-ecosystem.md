# Banza Integration Ecosystem — v1 Strategy Reference

> **This document is the authoritative reference for the Banza integration layer.**  
> For the architectural decision, see [ADR-011](../adr/ADR-011-integration-ecosystem-strategy.md).

---

## Mission

Banza must become **the easiest and most reliable way to integrate payments in Angola.**

The financial core — Rust ledger, PostgreSQL, Go API gateway — is the mechanism. The integration ecosystem is what gives that mechanism economic value. A perfect ledger that nobody can integrate is infrastructure for nothing.

The integration layer is therefore not auxiliary tooling. It is the primary interface between the financial platform and the market. Every SDK, every plugin, every checkout interface is a product in itself, held to production engineering standards.

---

## The Integration Pyramid

```
         ┌──────────────────────────────────────────┐
         │           MERCHANT / USER EXPERIENCE       │
         │   apps/checkout/   sdk/flutter/ (widgets)  │
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │            COMMERCE INTEGRATIONS           │
         │         plugins/woocommerce/               │
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │             DEVELOPER SDKs                 │
         │  sdk/flutter/  sdk/typescript/  sdk/python/│
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │           SERVER-SIDE ADAPTERS             │
         │  plugins/generic-node/  plugins/generic-php│
         │  plugins/generic-laravel/                  │
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │          PUBLIC REST API + OPENAPI          │
         │         api.banzami.com/v1/                 │
         └──────────────────────────────────────────┘
```

Each layer relies on the one below it. The REST API is the foundation. The SDKs are the primary developer interface. Commerce plugins sit on top of the SDKs. The checkout app and Flutter widgets are the consumer-facing surface.

---

## Layer 1 — REST API (Foundation)

**Location:** `services/api-gateway`, **docs:** `docs/api/`  
**Priority:** CRITICAL

The REST API is the universal integration point. Every other layer — SDKs, plugins, checkout — is built on it. Its quality ceiling determines the quality ceiling of everything above.

### Requirements

- **OpenAPI 3.1 specification** — machine-readable, generated from the Go server annotations.
- **Postman collection** — downloadable, immediately runnable.
- **Versioning** — all public endpoints live under `/v1/`. Breaking changes require `/v2/`.
- **Idempotency** — every `POST` accepts and enforces `Idempotency-Key`.
- **Structured errors** — all errors return `{ "code": "MACHINE_CODE", "message": "Human message" }`.
- **Pagination** — all list endpoints support cursor-based pagination: `?limit=N&cursor=TOKEN`.
- **Webhook delivery** — signed with `Banza-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>`.

### Endpoints (v1 surface)

| Domain | Key endpoints |
|--------|---------------|
| Transactions | `POST /transactions`, `GET /transactions/{id}`, `GET /transactions` |
| QR payments | `POST /qr/static`, `POST /qr/dynamic`, `GET /qr/{id}`, `POST /qr/decode`, `POST /qr/{id}/use` |
| Transfers | `POST /transfers`, `GET /transfers/{id}`, `GET /transfers` |
| Payouts | `POST /payouts`, `GET /payouts/{id}`, `GET /payouts` |
| Wallets | `GET /wallets/{id}`, `GET /wallets/{id}/balance` |
| Payment links | `POST /payment-links`, `GET /payment-links/{id}`, `DELETE /payment-links/{id}` |
| Merchants | `GET /merchants/{id}`, `GET/POST/DELETE /merchants/{id}/api-keys` |
| Webhooks | `GET/POST /webhooks/endpoints`, `DELETE /webhooks/endpoints/{id}`, `GET /webhooks/events` |
| Public | `GET /public/pay/{slug}`, `GET /public/pay/{slug}/status` |

---

## Layer 2 — Server-side Adapters

**Locations:** `plugins/generic-node/`, `plugins/generic-php/`, `plugins/generic-laravel/`  
**Priority:** HIGH

Server-side adapters are thin, language-idiomatic wrappers around the REST API. They reduce boilerplate for the most common server-side languages without adding framework opinions.

| Adapter | Language | Package | Primary use case |
|---------|----------|---------|-----------------|
| `generic-node` | TypeScript/Node | `@banza/node` | Express, Fastify, bare Node |
| `generic-php` | PHP | Composer package | WordPress, Laravel, vanilla PHP |
| `generic-laravel` | PHP/Laravel | Composer package | Laravel service provider + facades |

### Shared requirements

All adapters must implement:

- Retry with exponential backoff (500 ms base, ×2 per attempt, max 3 retries)
- Idempotency keys on every POST — generated once before the first attempt, reused across retries
- `Idempotency-Key` header sent on all POST requests
- Webhook signature verification (`HMAC-SHA256`, constant-time comparison)
- Money helpers: `formatAmount(minor, currency)`, `toMinorUnits(total, currency)`
- No external dependencies beyond language standard libraries (PHP adapter) or minimal (Node adapter: none beyond `node:crypto`)
- Examples directory with ≥3 realistic integration examples
- CHANGELOG following Keep a Changelog format

---

## Layer 3 — Developer SDKs

### 3.1 Flutter SDK

**Location:** `sdk/flutter/`  
**Priority:** CRITICAL  
**Runtime:** Dart / Flutter 3.x  
**Target:** iOS + Android

The Flutter SDK is not just a network client. It is the **Banza Mobile Runtime** — a complete toolkit for building payment-enabled mobile applications.

#### Client capabilities

```dart
final client = BanzaClient(
  baseUrl: 'https://api.banzami.com',
  apiKey:  'bz_live_...',
  onRequest:  (method, path, attempt) => logger.debug('$method $path #$attempt'),
  onResponse: (method, path, status, ms) => metrics.record(path, ms),
  onError:    (method, path, err, attempts) => logger.error('$err after $attempts attempts'),
);
```

#### Widget layer (roadmap items, not yet v1)

The following widget layer is planned for v1.1. Designs must use the official Banza design system:

| Widget | Description |
|--------|-------------|
| `BanzaPaymentSheet` | Bottom sheet with QR + amount + confirm |
| `BanzaQrScanner` | Camera overlay with Banza branding |
| `BanzaQrDisplay` | Animated QR with countdown timer |
| `BanzaTransferFlow` | Handle → amount → confirm 3-step flow |
| `BanzaWalletCard` | Balance display with Savanna Gold accent |

#### Design system compliance (Flutter)

```dart
// Official Banzami theme token — never hardcode colors in widgets
class BanzaColors {
  static const primary    = Color(0xFF990011);  // Space Cherry
  static const wineRose   = Color(0xFFA63A50);
  static const savannaGold= Color(0xFFC89B3C);
  static const background = Color(0xFFFCF6F5);
  static const textPrimary= Color(0xFF1A1A1A);
}
```

---

### 3.2 TypeScript SDK

**Location:** `sdk/typescript/`  
**Priority:** CRITICAL  
**Runtimes:** Node.js ≥ 18, browser (ESM), Next.js (SSR-safe)  
**Package:** `@banza/sdk`

The TypeScript SDK is the **primary web developer SDK**. It is the reference for ergonomics — all other SDKs should aspire to the same DX.

#### Usage pattern

```typescript
import { BanzaClient } from '@banza/sdk';

const client = new BanzaClient({
  baseUrl:  'https://api.banzami.com',
  apiKey:   process.env.BANZA_API_KEY!,
  hooks: {
    onRequest:  (method, path, attempt) => console.log(`→ ${method} ${path}`),
    onResponse: (method, path, status, ms) => console.log(`← ${status} (${ms}ms)`),
    onError:    (method, path, err, attempts) => console.error(err),
  },
});

const tx = await client.createTransaction({
  idempotencyKey: crypto.randomUUID(),
  amountMinor:    50000,
  currency:       'AOA',
  description:    'Compra na loja',
});
```

#### Build output

| Format | File | Use case |
|--------|------|----------|
| ESM | `dist/index.js` | Bundlers, Next.js, Deno |
| CJS | `dist/cjs/index.js` | `require()` in Node.js |
| Types | `dist/index.d.ts` | TypeScript users |

#### Ergonomic benchmarks

The TypeScript SDK must achieve parity with the following DX expectations (measured against Stripe's Node SDK):

- Import-to-first-call: ≤ 5 lines
- Full TypeScript inference on all responses — no `as any`
- Zero runtime surprises — no undocumented exceptions, no silent data loss
- Tree-shakeable — unused resources add zero bytes to browser bundles

---

### 3.3 Python SDK

**Location:** `sdk/python/`  
**Priority:** HIGH  
**Runtime:** Python 3.12+  
**Package:** `banza-python`  
**Paradigm:** async-first (`httpx` + `asyncio`)

#### Usage pattern

```python
from banza import BanzaClient

async with BanzaClient(api_key="bz_live_...") as client:
    # Transaction
    tx = await client.transactions.create(
        amount=50000,
        currency="AOA",
        description="Compra na loja",
    )

    # QR payment
    qr = await client.qr_payments.create_dynamic(
        owner_id="wallet_...",
        amount=25000,
        expires_at=datetime.now(tz=timezone.utc) + timedelta(minutes=15),
    )

    # Webhook
    event = client.webhooks.construct_event(raw_body, signature_header)
```

#### Resource namespaces

| Namespace | Methods |
|-----------|---------|
| `client.transactions` | create, retrieve, list, capture, reverse |
| `client.qr_payments` | create_static, create_dynamic, retrieve, decode, mark_used, check_status |
| `client.transfers` | send, retrieve, list |
| `client.payouts` | create, retrieve, list |
| `client.wallets` | retrieve, balance |
| `client.merchants` | retrieve, list_api_keys, create_api_key, revoke_api_key |
| `client.webhooks` | list_endpoints, register_endpoint, delete_endpoint, list_events, construct_event |

---

## Layer 4 — Commerce Integrations

### WooCommerce Plugin

**Location:** `plugins/woocommerce/banzami-payment/`  
**Priority:** CRITICAL  
**Market rationale:** WordPress + WooCommerce is the dominant commerce stack for Angolan SME websites. Shopify's pricing and market penetration do not justify v1 investment.

#### What the plugin provides

A merchant installs the plugin, enters their API key, and immediately accepts payments. No code. No webhooks to configure manually. No technical knowledge required.

| Feature | Description |
|---------|-------------|
| QR checkout | WooCommerce checkout page shows Banzami QR code |
| Hosted checkout redirect | Redirect to `apps/checkout/` for the payment UX |
| Order synchronization | Webhook listener updates WooCommerce order status automatically |
| Payment confirmation | Order moves to "Processing" when payment is confirmed |
| Refunds | Admin-initiated refunds flow through the Banza payouts API |
| Retry | Failed webhook delivery retried with exponential backoff |

#### Plugin settings (admin UI)

| Field | Description |
|-------|-------------|
| API Key | `bz_live_...` or `bz_test_...` |
| Webhook Secret | Used to verify `Banza-Signature` |
| Test Mode | Toggle between live and test environment |
| Checkout Mode | QR inline / redirect to hosted checkout |

#### Future commerce integrations (not v1)

The following are on the roadmap but explicitly deferred past v1 stabilization:

- **Shopify app** — deferred; low Angolan market penetration
- **Magento plugin** — deferred; minimal market relevance
- **PrestaShop plugin** — deferred
- **Custom checkout JS widget** — deferred

---

## Layer 5 — Hosted Checkout

**Location:** `apps/checkout/`  
**URL:** `https://pay.banzami.com/{slug}`  
**Priority:** CRITICAL  
**Technology:** Next.js 14, App Router, port 3004

The hosted checkout is **core payment infrastructure**, not a marketing page. It is the payment interface for:

- Payment links shared over WhatsApp, Telegram, Instagram
- QR codes displayed at physical merchant locations
- Merchants with no engineering team (WooCommerce redirect mode)
- Social commerce: "pay here" links in any digital channel

A slow or visually untrustworthy checkout page directly causes payment abandonment. It must be treated with the same engineering discipline as the financial core.

### Payment states

```
                    ┌─────────┐
                    │ LOADING │  Fetching link data + generating QR
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ ACTIVE  │  QR displayed + countdown timer
                    └────┬────┘
                    /         \
           ┌───────▼───┐   ┌──▼──────┐
           │ CONFIRMED │   │ EXPIRED │
           │ (paid)    │   │         │
           └───────────┘   └─────────┘
```

### Technical requirements

| Requirement | Implementation |
|-------------|---------------|
| QR generation | Server-side (Next.js RSC), `qrcode` npm package, base64 data URL |
| No flash of missing content | QR is pre-rendered on server, passed as prop to client component |
| Polling | Every 3 seconds, `GET /public/pay/{slug}/status` |
| Mobile-first | Viewport-optimized, single-scroll, no horizontal scroll |
| Load time | < 1.5s on 3G (no heavy JS bundles; QR is server-rendered) |
| Brand | Official Banza palette; merchant name displayed |

### Design system (checkout)

```typescript
// tailwind.config.ts — Banzami design tokens
colors: {
  wine:     { DEFAULT: '#990011', rose: '#A63A50' },
  gold:     { DEFAULT: '#C89B3C' },
  offwhite: { DEFAULT: '#FCF6F5' },
}
```

---

## QR-First Strategy

QR payment is a strategic pillar, not an optional feature. The reasoning:

1. **No card infrastructure required** — QR works with any smartphone and any bank account behind Banza.
2. **Offline-compatible** — the merchant device displays the QR; the payer device scans it. Only one device needs connectivity at the moment of scanning.
3. **Social-native** — a QR code image can be shared in any messaging app. Payment links become shareable payment QR codes.
4. **Eliminates NFC/POS hardware requirement** — the merchant's phone or a printed QR code is the payment terminal.

### QR capability matrix

| Capability | Flutter SDK | TypeScript SDK | Python SDK | WooCommerce | Checkout |
|------------|:-----------:|:--------------:|:----------:|:-----------:|:--------:|
| Static QR (reusable) | ✓ | ✓ | ✓ | ✓ | — |
| Dynamic QR (single-use, fixed amount) | ✓ | ✓ | ✓ | ✓ | ✓ |
| QR decode | ✓ | ✓ | ✓ | — | — |
| QR status polling | ✓ | ✓ | ✓ | ✓ | ✓ |
| QR generation (image) | Flutter widget | Browser API | `qrcode` lib | PHP QR lib | Server-side |
| Deep link (`banzami://pay/`) | ✓ | — | — | — | — |

---

## Design System Compliance

All consumer-facing surfaces — `apps/checkout/`, Flutter widgets, WooCommerce checkout — must use the official Banza design system without deviation.

### Official palette

| Name | Hex | Usage |
|------|-----|-------|
| Space Cherry | `#990011` | Primary buttons, QR frame, confirmation state |
| Wine Rose | `#A63A50` | Secondary actions, borders, hover states |
| Savanna Gold | `#C89B3C` | Accent, amount display, brand differentiation |
| Off-white | `#FCF6F5` | Page background, card backgrounds |
| Text Primary | `#1A1A1A` | All body text |

### Visual direction

- **Elegant, not aggressive** — the primary red (`#990011`) is used purposefully, not as a dominant background.
- **Light theme first** — dark mode support is a future consideration; do not design for dark mode prematurely.
- **Premium and minimal** — sufficient whitespace, clean typography, no decorative clutter.
- **Locally rooted** — the visual language should feel appropriate for Angola and Portuguese-speaking Africa, not copied from a Silicon Valley template.
- **Fintech-grade trust** — users are being asked to send money. Every pixel should communicate stability and reliability.

### Anti-patterns (explicitly prohibited)

- Full red backgrounds on payment-critical screens
- Inconsistent font families across surfaces
- Missing or incorrect AOA formatting (must be `50.000 Kz`, not `50,000 AOA`)
- English-only error messages (messages shown to consumers must be in Portuguese)
- Design token deviations without an explicit approved reason

---

## SDK Engineering Standards

Every SDK and plugin must conform to the following cross-cutting requirements:

### Retry policy

```
Attempt 1: immediate
Attempt 2: wait 500 ms
Attempt 3: wait 1 000 ms
Attempt 4: wait 2 000 ms
```

Retry only on: `429 Too Many Requests`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout`.

Never retry: `400`, `401`, `403`, `404`, `409`, `422` — these indicate a client error that will not resolve on re-attempt.

### Idempotency

Every `POST` request must include an `Idempotency-Key` header. The key is:
- Generated once per logical operation, before the first attempt
- Reused across all retry attempts for that operation
- A UUID v4 or equivalent random 128-bit value

```
First attempt:  POST /v1/payouts  Idempotency-Key: a3f7c2d1-...
Second attempt: POST /v1/payouts  Idempotency-Key: a3f7c2d1-...  ← same key
Third attempt:  POST /v1/payouts  Idempotency-Key: a3f7c2d1-...  ← same key
```

This guarantees that a network failure during a financial operation cannot result in a duplicate payout, duplicate transfer, or duplicate transaction.

### Webhook verification

All SDKs must provide a `verifyWebhookSignature` function that:
1. Accepts the raw body (bytes, before any decoding)
2. Accepts the `Banza-Signature` header value
3. Accepts the webhook secret from the Banza dashboard
4. Returns a boolean or raises a typed exception
5. Uses constant-time comparison (prevents timing oracle attacks)

```
Expected: sha256=HMAC-SHA256(secret, raw_body)
Actual:   Banza-Signature header value
Compare:  constant-time (hmac.compare_digest or equivalent)
```

### Money handling

AOA (Angolan Kwanza) is an integer currency — there are no decimal Kwanza. Amounts are always stored and transmitted as integer minor units (Kwanza).

```
1 Kz  = 1 minor unit
50 Kz = 50 minor units
```

For USD and other ISO 4217 currencies with sub-unit fractions:
```
$1.00 = 100 minor units (cents)
$0.01 = 1 minor unit
```

Floating-point arithmetic is **forbidden** for money. All internal arithmetic uses integer minor units.

Display formatting:
```
format_minor(50000, "AOA") → "50.000 Kz"  (Portuguese number format)
format_minor(5000,  "USD") → "USD 50.00"
```

---

## Secondary SDK Roadmap

The following SDKs are acknowledged as strategically valuable but are explicitly deferred until the v1 ecosystem is stable and in production:

| SDK | Reason for deferral |
|-----|---------------------|
| `sdk/kotlin/` | Flutter SDK serves the Android use case; Kotlin SDK needed only for SDK-less Android native apps |
| `sdk/react-native/` | Flutter SDK is preferred for Banza-native apps; RN SDK needed only for existing RN codebases |
| `sdk/go/` | Go is used internally; Go SDK needed only for third-party Go backends |
| `sdk/dotnet/` | .NET penetration in Angola is low in the SME market |
| `sdk/php/` (standalone) | Covered by `plugins/generic-php/` for most use cases |

The criterion for promoting a secondary SDK to active development:
> Inbound integration requests from ≥3 merchants or developers for that specific language/runtime.

---

## Ecosystem Health Metrics

The following metrics define a healthy integration ecosystem. They are tracked, not aspirational:

| Metric | Target (12 months) |
|--------|---------------------|
| SDK integration time (median) | < 30 minutes from API key to first live transaction |
| SDK test coverage (all v1 SDKs) | ≥ 80% |
| Webhook delivery success rate | ≥ 99.5% |
| Checkout page load time (3G) | < 1.5s |
| API error rate (merchant-facing) | < 0.1% of requests |
| Open documentation issues | < 10 at any given time |

---

## Document Control

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-15 | Initial strategy document |

**Owner:** Banza Engineering  
**Review cadence:** Quarterly, or after any SDK major version release
