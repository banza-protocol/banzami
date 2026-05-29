# Banza API Reference

Banzami is Angola's programmable instant payments infrastructure. The API is the developer entry point — enabling any Angolan application to accept instant Kwanza payments, generate QR codes, create payment links, and process wallet transfers natively within their product.

For most integrations, use an official [Banzami SDK](../../sdk/) rather than calling the API directly. The SDK handles idempotency, retries, webhook signature verification, and type safety automatically.

This directory contains the API reference for all external and internal Banza APIs.

---

## Services and Ports

| Service | Port | Audience | Auth |
|---------|------|----------|------|
| `api-gateway` | 8080 | Merchants (server-to-server) | JWT (API key exchange) |
| `public-api` | 8083 | Consumers (mobile/browser) | JWT (handle + PIN) |
| `admin-api` | 8082 | Internal operators | Static `X-Admin-Key` |
| `core-api` (Rust) | 8081 | Internal only | None (loopback) |

---

## Common Conventions

### Authentication

All authenticated endpoints require:

```
Authorization: Bearer <jwt>
```

### Error format

Every error response has the same shape:

```json
{
  "code": "NOT_FOUND",
  "message": "payment link not found",
  "request_id": "550e8400-e29b-41d4"
}
```

### Pagination

List endpoints return cursor-based pages:

```json
{
  "data": [...],
  "has_more": true,
  "next_cursor": "eyJ..."
}
```

Pass `?cursor=<next_cursor>` on the next request.

### Monetary amounts

All amounts are in **minor units** (integers). For AOA (Angolan Kwanza), 1 Kwanza = 1 minor unit (no subdivisions used). For USD/EUR, 1 unit = 100 cents.

---

## Merchant API (api-gateway, port 8080)

### Authentication

#### POST /v1/auth/token

Exchange an API key for a JWT.

**Request:**
```json
{ "api_key": "bz_live_..." }
```

**Response 200:**
```json
{
  "token": "eyJ...",
  "expires_at": "2026-05-14T10:00:00Z",
  "token_type": "Bearer"
}
```

---

### Payment Links

#### POST /v1/payment-links

Create a payment link.

**Request:**
```json
{
  "merchant_id": "uuid",
  "wallet_id":   "uuid",
  "amount_minor": 50000,
  "currency":    "AOA",
  "description": "Invoice #1042",
  "expires_at":  "2026-05-15T00:00:00Z"
}
```
`amount_minor` is optional. If omitted, the link is open (consumer enters amount).  
`expires_at` is optional.

**Response 201:**
```json
{
  "id":           "uuid",
  "slug":         "a3f7c2d19b40",
  "merchant_id":  "uuid",
  "wallet_id":    "uuid",
  "amount_minor": 50000,
  "currency":     "AOA",
  "description":  "Invoice #1042",
  "status":       "ACTIVE",
  "expires_at":   "2026-05-15T00:00:00Z",
  "paid_at":      null,
  "created_at":   "2026-05-13T09:00:00Z",
  "updated_at":   "2026-05-13T09:00:00Z"
}
```

**Pay URL:** `https://pay.banzami.org/{slug}`

#### GET /v1/payment-links?merchant_id=&limit=&cursor=

List payment links for a merchant.

#### GET /v1/payment-links/{id}

Get a single payment link by UUID.

#### GET /v1/payment-links/by-slug/{slug}

Get a payment link by slug.

#### POST /v1/payment-links/{id}/cancel

Cancel an active link. Returns `PAYMENT_LINK_NOT_ACTIVE (409)` if not ACTIVE.

#### POST /v1/payment-links/{id}/mark-used

Mark a link as used (called internally after a successful payment). Returns the updated link.

---

### Webhooks

Banza notifies your server for every significant payment event. Register an endpoint once; we sign every delivery with HMAC-SHA256 so you can verify origin.

#### POST /v1/webhooks/endpoints

Register a webhook endpoint.

**Request:**
```json
{
  "url":    "https://yourserver.com/banzami/webhook",
  "secret": "your-32-char-signing-secret",
  "events": ["transaction.captured", "payout.sent"]
}
```
`events`: array of event types to subscribe to. Pass `["*"]` to receive all events.

**Response 201:**
```json
{
  "id":         "uuid",
  "url":        "https://yourserver.com/banzami/webhook",
  "events":     ["transaction.captured", "payout.sent"],
  "active":     true,
  "created_at": "2026-05-13T09:00:00Z"
}
```

#### GET /v1/webhooks/endpoints

List all registered endpoints for the authenticated merchant.

#### GET /v1/webhooks/endpoints/{id}

Get a single endpoint.

#### DELETE /v1/webhooks/endpoints/{id}

Deactivate an endpoint (soft-delete; keeps delivery history).

#### GET /v1/webhooks/events?limit=&cursor=

List recent webhook events (attempts, delivery status).

#### GET /v1/webhooks/events/{id}/deliveries

List all delivery attempts for a specific event.

**Webhook payload shape:**
```json
{
  "id":         "uuid",
  "type":       "transaction.captured",
  "created_at": "2026-05-13T09:05:00Z",
  "data": { ... }
}
```

**Signature verification:**

Each delivery includes a `Banza-Signature` header:
```
Banza-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>
```
Parse the `t=` and `v1=` components. Verify `|now - t| ≤ 300 s` (replay protection), then compute `HMAC-SHA256(secret, t + "." + raw_body)` and compare the hex digest against `v1` in constant time.

**Event types:**

| Event | Fired when |
|-------|-----------|
| `transaction.captured` | A payment transaction reaches CAPTURED status |
| `transaction.reversed` | A transaction is reversed |
| `settlement.confirmed` | A settlement batch is confirmed by the bank |
| `payout.sent` | A payout is dispatched |
| `payout.confirmed` | A payout is confirmed received |
| `payout.failed` | A payout fails after all retries |
| `payment_link.used` | A payment link is paid |

---

### Payouts

Request a payout of settled funds to your registered bank account.

#### POST /v1/payouts

Initiate a payout.

**Request:**
```json
{
  "merchant_id": "uuid",
  "wallet_id":   "uuid",
  "amount_minor": 500000,
  "currency":    "AOA",
  "description": "Weekly payout — W20"
}
```

**Response 201:**
```json
{
  "id":           "uuid",
  "merchant_id":  "uuid",
  "wallet_id":    "uuid",
  "amount_minor": 500000,
  "currency":     "AOA",
  "status":       "PENDING",
  "description":  "Weekly payout — W20",
  "created_at":   "2026-05-13T09:00:00Z",
  "updated_at":   "2026-05-13T09:00:00Z"
}
```

**Payout statuses:** `PENDING → PROCESSING → SENT → CONFIRMED` (or `FAILED` / `RETURNED`).

#### GET /v1/payouts?merchant_id=&limit=&cursor=

List payouts.

#### GET /v1/payouts/{id}

Get a single payout.

---

### Transactions

#### POST /v1/transactions

Create a payment transaction (merchant initiates a payment against a consumer).

**Request:**
```json
{
  "idempotency_key": "order-1234",
  "transaction_type": "PAYMENT",
  "amount_minor": 75000,
  "currency": "AOA",
  "merchant_id": "uuid",
  "wallet_id": "uuid",
  "description": "Coffee and pastry"
}
```

#### GET /v1/transactions/{id}

Get a transaction by ID.

#### GET /v1/transactions?merchant_id=&limit=&cursor=

List transactions for a merchant.

---

### Wallets

#### POST /v1/wallets

Create a merchant wallet.

#### GET /v1/wallets/{id}

Get wallet details.

#### GET /v1/wallets/{id}/balance

Get wallet balance.

---

### Transfers

#### POST /v1/transfers

Initiate a P2P transfer (merchant context — wallet ID to wallet ID).

#### GET /v1/transfers/{id}

Get a transfer by ID.

#### GET /v1/transfers?consumer_id=&limit=&cursor=

List transfers.

---

### QR Codes

#### POST /v1/qr/static

Generate a static QR code for a wallet.

#### POST /v1/qr/dynamic

Generate a dynamic (amount + expiry) QR code.

#### GET /v1/qr/{id}

Get QR code details and payload.

#### POST /v1/qr/{id}/use

Mark a QR code as used (called on scan).

#### POST /v1/qr/decode

Decode a QR payload string into structured data.

---

### Sandbox Utilities

These endpoints are only available to callers authenticated with a `bz_test_…` key. Live keys receive `403 SANDBOX_ONLY`.

#### GET /v1/sandbox/status

Confirm the caller is in sandbox mode.

**Response 200:**
```json
{
  "environment": "SANDBOX",
  "merchant_id": "uuid",
  "message":     "You are operating in sandbox mode. All financial operations are simulated."
}
```

#### GET /v1/sandbox/instruments

List test payment instruments and the deterministic scenario each one triggers.

#### POST /v1/sandbox/fund

Credit the sandbox merchant wallet via the ledger engine. Maximum 100,000,000 AOA per call.

**Request:**
```json
{ "amount_minor": 5000000, "currency": "AOA" }
```

**Response 200:**
```json
{
  "funded":         true,
  "wallet_id":      "uuid",
  "currency":       "AOA",
  "credited_minor": 5000000,
  "new_balance": {
    "available_minor": 5000000,
    "reserved_minor":  0,
    "currency":        "AOA"
  },
  "note": "Sandbox wallet credited via ledger. Virtual balance — no real funds moved."
}
```

The balance update is immediate, persistent, and reflected in all downstream operations (QR payments, transfers, payouts).

#### POST /v1/sandbox/simulate/payment

Inject a synthetic payment transaction.

**Request:**
```json
{
  "amount_minor": 50000,
  "currency":     "AOA",
  "description":  "Order #12345",
  "scenario":     "success"
}
```

Valid scenarios: `success`, `insufficient_funds`, `fraud_blocked`, `expired_card`, `auth_challenge`.

**Response 201:**
```json
{
  "transaction": { "id": "uuid", "status": "CAPTURED", … },
  "scenario":    "success",
  "note":        "Simulated sandbox transaction. No real money was moved."
}
```

---

## Consumer API (public-api, port 8083)

### Authentication

#### POST /v1/auth/register

Create a consumer account and receive a JWT.

**Request:**
```json
{
  "handle":       "joao_silva",
  "display_name": "João Silva",
  "pin":          "1234"
}
```
`handle`: 3–30 characters, lowercased, unique.  
`pin`: 4–8 digits.  
`display_name`: optional.

**Response 201:**
```json
{
  "consumer": {
    "id":                 "uuid",
    "handle":             "joao_silva",
    "display_name":       "João Silva",
    "status":             "ACTIVE",
    "verification_badge": null,
    "created_at":         "2026-05-13T09:00:00Z",
    "updated_at":         "2026-05-13T09:00:00Z"
  },
  "token":      "eyJ...",
  "expires_at": "2026-05-14T09:00:00Z",
  "token_type": "Bearer"
}
```

**Errors:**
- `409 HANDLE_TAKEN` — handle already registered.
- `400 INVALID_FIELD` — handle too short/long or PIN length invalid.

#### POST /v1/auth/token

Authenticate and receive a JWT.

**Request:**
```json
{ "handle": "joao_silva", "pin": "1234" }
```

**Response 200:**
```json
{
  "token":      "eyJ...",
  "expires_at": "2026-05-14T09:00:00Z",
  "token_type": "Bearer"
}
```

**Errors:**
- `401 INVALID_CREDENTIALS` — wrong handle or PIN (identical error to prevent enumeration).

---

### Profile

#### GET /v1/me

Get the authenticated consumer's profile.

**Response 200:**
```json
{
  "id":                 "uuid",
  "handle":             "joao_silva",
  "display_name":       "João Silva",
  "status":             "ACTIVE",
  "verification_badge": "CONSUMER",
  "created_at":         "2026-05-13T09:00:00Z",
  "updated_at":         "2026-05-13T09:00:00Z"
}
```

`verification_badge`: `"CONSUMER"` (gold pill in app), `"MERCHANT"` (blue pill), or `null` if no badge has been assigned by an admin.

#### GET /v1/me/wallet?currency=AOA

Get (or create) the consumer's wallet for a currency. Defaults to AOA.

**Response 200:**
```json
{
  "id":          "uuid",
  "consumer_id": "uuid",
  "currency":    "AOA",
  "status":      "ACTIVE",
  "created_at":  "2026-05-13T09:00:00Z"
}
```

#### GET /v1/me/wallet/balance?currency=AOA

Get the current wallet balance.

**Response 200:**
```json
{
  "wallet_id":       "uuid",
  "consumer_id":     "uuid",
  "currency":        "AOA",
  "available_minor": 150000,
  "reserved_minor":  0,
  "total_minor":     150000,
  "computed_at":     "2026-05-13T09:00:00Z"
}
```

**Errors:**
- `404 NO_WALLET` — no wallet in this currency; call `GET /v1/me/wallet` to create.

---

### Transfers

#### POST /v1/transfers

Send money to another consumer by handle.

**Request:**
```json
{
  "recipient_handle": "maria_shop",
  "amount_minor":     25000,
  "currency":         "AOA",
  "description":      "Lunch",
  "idempotency_key":  "optional-client-key"
}
```
`idempotency_key` is optional; a UUID is generated server-side if omitted.

**Response 201:**  
Transfer object (see below).

**Errors:**
- `400 SELF_TRANSFER` — sending to yourself.
- `404 RECIPIENT_NOT_FOUND` — unknown handle.
- `422 INSUFFICIENT_FUNDS`
- `422 NO_WALLET` — sender has no wallet in that currency.
- `422 RECIPIENT_NO_WALLET` — recipient has no wallet in that currency.

#### GET /v1/transfers?limit=20&cursor=

List the authenticated consumer's transfers (sent and received).

#### GET /v1/transfers/{id}

Get a single transfer.

**Transfer object:**
```json
{
  "id":               "uuid",
  "idempotency_key":  "...",
  "sender_id":        "uuid",
  "recipient_id":     "uuid",
  "amount": {
    "amount_minor": 25000,
    "currency":     "AOA"
  },
  "currency":          "AOA",
  "status":            "COMPLETED",
  "description":       "Lunch",
  "failure_reason":    null,
  "ledger_posting_id": "uuid",
  "created_at":        "2026-05-13T09:05:00Z",
  "updated_at":        "2026-05-13T09:05:00Z"
}
```

---

### Payment Links

#### GET /v1/payment-links/{slug}

Get payment link details. **No authentication required.**

**Response 200:** PaymentLink object (see merchant API above).

#### POST /v1/payment-links/{slug}/pay

Pay a payment link from the consumer's wallet. **JWT required.**

**Request (fixed-amount links):** Empty body `{}`.

**Request (open links):**
```json
{ "amount_minor": 10000 }
```

**Response 200:** Updated PaymentLink object with `status: "USED"`.

**Errors:**
- `422 LINK_NOT_ACTIVE` — link is USED, EXPIRED, or CANCELLED.
- `422 INSUFFICIENT_FUNDS`
- `422 NO_WALLET` — no wallet in the link's currency.

---

### Consumer Search

#### GET /v1/consumers/search?q=

Search for active consumers by handle prefix. **No authentication required.** Used for autocomplete in the send screen. Returns up to 5 results.

**Query params:**
- `q` — minimum 2 characters; case-insensitive substring match on handle.

**Response 200:**
```json
{
  "data": [
    { "handle": "joao_silva", "display_name": "João Silva" },
    { "handle": "joao_coffee", "display_name": null }
  ]
}
```

#### GET /v1/consumers/{handle}

Check whether a handle is registered. **No authentication required.** Used for handle existence validation before sending.

**Response 200:** Consumer object.  
**Response 404:** Handle not found.

---

### Sandbox Utilities (public-api)

These endpoints are only available when the public-api instance is deployed with `ENVIRONMENT=SANDBOX`. They return `403 SANDBOX_ONLY` in production.

#### POST /v1/sandbox/fund

Credit the authenticated consumer's sandbox wallet with virtual funds. Maximum 100,000,000 AOA per call.

**Request:**
```json
{
  "amount_minor": 5000000,
  "currency":     "AOA"
}
```

**Response 200:**
```json
{
  "funded":         true,
  "currency":       "AOA",
  "credited_minor": 5000000,
  "new_balance":    5000000,
  "note":           "Sandbox wallet credited. Virtual balance — no real funds moved."
}
```

**Errors:**
- `403 SANDBOX_ONLY` — service is not running in SANDBOX environment.
- `400 VALIDATION_ERROR` — `amount_minor` is zero, negative, or exceeds the cap.

---

## Public Endpoints (api-gateway, no auth)

These endpoints are used by the `pay.banzami.org` pay page JavaScript.

#### GET /public/pay/{slug}

Get payment link details for the pay page (same as `/v1/payment-links/by-slug/{slug}` but no auth).

#### GET /public/pay/{slug}/status

Lightweight status poll for the pay page.

**Response 200:**
```json
{ "paid": false }
```
Returns `true` when `status == "USED"`.

---

## Admin API (admin-api, port 8082)

Internal operator endpoints. Authenticated via `X-Admin-Key` header (static key configured at deploy time). Never exposed publicly.

### Consumers

#### GET /admin/v1/consumers?handle=

List consumers. Optional `handle` query param filters by partial match.

**Response 200:**
```json
{
  "data": [
    {
      "id":                 "uuid",
      "handle":             "joao_silva",
      "display_name":       "João Silva",
      "status":             "ACTIVE",
      "verification_badge": null,
      "created_at":         "2026-05-13T09:00:00Z"
    }
  ]
}
```

#### GET /admin/v1/consumers/{id}

Get a consumer by UUID.

#### PATCH /admin/v1/consumers/{id}/badge

Assign or remove the verification badge shown on the consumer's profile screen.

**Request:**
```json
{ "badge": "CONSUMER" }
```

| Value | Display |
|-------|---------|
| `"CONSUMER"` | Gold "Verificado" pill — verified individual |
| `"MERCHANT"` | Blue "Comerciante" pill — verified business |
| `null` | No badge (remove existing) |

**Response 200:** Updated consumer object.

**Errors:**
- `404 NOT_FOUND` — consumer does not exist.
- `400 BAD_REQUEST` — unknown badge type.

---

## Error Codes Reference

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid Authorization header |
| `INVALID_TOKEN` | 401 | JWT expired, malformed, or wrong key |
| `INVALID_CREDENTIALS` | 401 | Wrong handle or PIN |
| `FORBIDDEN` | 403 | Valid token but missing required scope |
| `SANDBOX_ONLY` | 403 | Endpoint only available in SANDBOX environment |
| `NOT_FOUND` | 404 | Resource does not exist |
| `HANDLE_TAKEN` | 409 | Consumer handle already registered |
| `LINK_NOT_ACTIVE` | 422 | Payment link is not in ACTIVE state |
| `INSUFFICIENT_FUNDS` | 422 | Sender balance too low |
| `SELF_TRANSFER` | 400 | Sender and recipient are the same |
| `INVALID_AMOUNT` | 400 | Amount is zero, negative, or missing |
| `MISSING_FIELD` | 400 | Required request field is absent |
| `INVALID_BODY` | 400 | Request body is not valid JSON |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limiting

All authenticated routes are rate-limited per API key using a sliding-window counter backed by Redis.

| Route group | Limit |
|-------------|-------|
| Default | 120 requests / minute |
| `POST /v1/transfers` | 30 requests / minute |
| `POST /v1/auth/token` | 10 requests / minute |

When the limit is exceeded the API returns `429 RATE_LIMITED`. The response includes:

```
Retry-After: 15
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1715598120
```

---

## Idempotency

All mutating endpoints (`POST`, `PATCH`) support idempotency via the `X-Idempotency-Key` header.

```
X-Idempotency-Key: <client-generated-uuid>
```

If the same key is sent twice within 24 hours, the second request returns the original response without re-executing. Use this to safely retry after network errors.

Financial endpoints (`/v1/transfers`, `/v1/transactions`) also accept `idempotency_key` in the request body as an alternative.
