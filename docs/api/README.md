# Banzami API Reference

This directory contains the API reference for all external and internal Banzami APIs.

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
    "id":           "uuid",
    "handle":       "joao_silva",
    "display_name": "João Silva",
    "status":       "ACTIVE",
    "created_at":   "2026-05-13T09:00:00Z",
    "updated_at":   "2026-05-13T09:00:00Z"
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
  "id":           "uuid",
  "handle":       "joao_silva",
  "display_name": "João Silva",
  "status":       "ACTIVE",
  "created_at":   "2026-05-13T09:00:00Z",
  "updated_at":   "2026-05-13T09:00:00Z"
}
```

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

## Error Codes Reference

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid Authorization header |
| `INVALID_TOKEN` | 401 | JWT expired, malformed, or wrong key |
| `INVALID_CREDENTIALS` | 401 | Wrong handle or PIN |
| `FORBIDDEN` | 403 | Valid token but missing required scope |
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
