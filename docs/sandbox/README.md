# Banza Sandbox

## Overview

Banza operates two completely isolated environments:

| | **Sandbox** | **Live** |
|---|---|---|
| API key prefix | `bz_test_…` | `bz_live_…` |
| Base URL | `https://sandbox-api.banzami.com` | `https://api.banzami.com` |
| Dashboard | `https://sandbox-dashboard.banzami.com` | `https://dashboard.banzami.com` |
| Checkout | `https://sandbox-checkout.banzami.com` | `https://checkout.banzami.com` |
| Money | Virtual — no real funds | Real Angolan Kwanza |
| Database | Completely separate | Completely separate |
| Redis | Completely separate | Completely separate |
| Webhooks | Isolated — sandbox webhooks only | Isolated — live webhooks only |

Sandbox and live data **never mix**. A `bz_test_` key cannot read or write live records. A `bz_live_` key cannot access sandbox endpoints. This is enforced at the API-gateway middleware layer via the environment claim embedded in every JWT.

---

## Getting Started

### 1. Obtain a sandbox API key

Create a sandbox key via the dashboard **Settings → API Keys** or via the API:

```http
POST /v1/merchants/{id}/api-keys
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name":        "Sandbox integration key",
  "environment": "SANDBOX"
}
```

**Response:**

```json
{
  "id":          "a1b2c3d4-…",
  "name":        "Sandbox integration key",
  "key_prefix":  "ab12cd34",
  "environment": "SANDBOX",
  "secret":      "bz_test_ab12cd34…"
}
```

The `secret` is shown **once only**. Store it securely.

### 2. Exchange the key for a JWT

```http
POST /v1/auth/token
Content-Type: application/json

{"api_key": "bz_test_ab12cd34…"}
```

**Response:**

```json
{
  "token":       "eyJ…",
  "expires_at":  "2026-05-17T10:00:00Z",
  "token_type":  "Bearer",
  "environment": "SANDBOX"
}
```

All subsequent requests use `Authorization: Bearer <token>`.

### 3. Confirm sandbox status

```http
GET /v1/sandbox/status
Authorization: Bearer <token>
```

```json
{
  "environment": "SANDBOX",
  "merchant_id": "…",
  "message":     "You are operating in sandbox mode. All financial operations are simulated."
}
```

---

## Test Payment Instruments

These card numbers trigger deterministic outcomes in the sandbox. No real card network is invoked.

### Test Cards

| Card number | Scenario | Outcome |
|---|---|---|
| `4242 4242 4242 4242` | `success` | Payment completes immediately → `CAPTURED` |
| `4000 0000 0000 9995` | `insufficient_funds` | Payment fails → `FAILED` with `INSUFFICIENT_FUNDS` |
| `4100 0000 0000 0019` | `fraud_blocked` | Risk engine blocks → `FAILED` with `FRAUD_BLOCKED` |
| `4000 0000 0000 0069` | `expired_card` | Card rejected → `FAILED` with `EXPIRED_CARD` |
| `4000 0027 6000 3184` | `auth_challenge` | 3DS challenge required → `PENDING` |

Use expiry `12/30` and CVV `123` for all test cards unless otherwise noted.

### Retrieve instruments via API

```http
GET /v1/sandbox/instruments
Authorization: Bearer <token>
```

---

## Sandbox Utilities

### Fund a Merchant Wallet

Credit the sandbox merchant wallet with virtual AOA (maximum 100,000,000 AOA per call).

The credit is applied as a direct ledger entry in the financial core — the same double-entry infrastructure used by production payments. The balance update is immediate, persistent, and reflected in all downstream operations (QR payments, transfers, payouts). No real funds are moved.

**API (api-gateway, port 8080):**

```http
POST /v1/sandbox/fund
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount_minor": 5000000,
  "currency":     "AOA"
}
```

**Response:**

```json
{
  "funded":         true,
  "wallet_id":      "uuid",
  "currency":       "AOA",
  "credited_minor": 5000000,
  "new_balance":    5000000,
  "note": "Sandbox wallet credited via ledger. Virtual balance — no real funds moved."
}
```

**Dashboard:** In the merchant dashboard (`/wallets`), sandbox sessions display an amber **"Adicionar fundos de teste"** panel with four preset amounts: 5.000 AOA, 10.000 AOA, 50.000 AOA, 100.000 AOA. Clicking a preset calls `POST /v1/sandbox/fund` and refreshes the balance display automatically. The panel is only visible when the session is authenticated with a `bz_test_…` key.

---

### Fund a Consumer Wallet

Credit the sandbox consumer wallet with virtual AOA directly from the mobile SDK. Maximum 100,000,000 AOA per call.

**API (public-api, port 8083 — requires consumer JWT):**

```http
POST /v1/sandbox/fund
Authorization: Bearer <consumer-jwt>
Content-Type: application/json

{
  "amount_minor": 5000000,
  "currency":     "AOA"
}
```

**Response:**

```json
{
  "funded":         true,
  "currency":       "AOA",
  "credited_minor": 5000000,
  "new_balance":    5000000,
  "note": "Sandbox wallet credited. Virtual balance — no real funds moved."
}
```

Returns `403 SANDBOX_ONLY` if the public-api instance is not running with `ENVIRONMENT=SANDBOX`.

**Flutter SDK:**

```dart
final client = ConsumerPublicClient(
  baseUrl:     'https://sandbox-api.banzami.com',
  environment: BanzamiEnvironment.sandbox,
);

await client.login(handle: 'joao', pin: '123456');

final result = await client.sandboxFund(amountMinor: 5000000); // 50 000 Kz
print(result.newBalance); // 5000000
```

**In-app panel:** When `BanzamiHomeScreen` is initialised with `environment: BanzamiEnvironment.sandbox`, a yellow **"Modo Sandbox — adicionar fundos"** panel appears below the balance card with four presets: 10.000 Kz, 50.000 Kz, 200.000 Kz, 1.000.000 Kz. Tapping a preset calls `sandboxFund()` and refreshes the balance automatically.

### Simulate a Payment

Inject a synthetic transaction to test your webhook handlers or dashboard:

```http
POST /v1/sandbox/simulate/payment
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount_minor": 50000,
  "currency":     "AOA",
  "description":  "Order #12345",
  "scenario":     "success"
}
```

Valid scenarios: `success`, `insufficient_funds`, `fraud_blocked`, `expired_card`, `auth_challenge`.

**Response:**

```json
{
  "transaction": { "id": "…", "status": "CAPTURED", "environment": "SANDBOX", … },
  "scenario":    "success",
  "note":        "Simulated sandbox transaction. No real money was moved."
}
```

---

## SDK Integration

### TypeScript / Node.js

```typescript
import { BanzaClient } from '@banza/sdk';

// Sandbox
const sandbox = new BanzaClient({
  apiKey:      'bz_test_…',
  environment: 'sandbox',
});

// Production
const live = new BanzaClient({
  apiKey:      'bz_live_…',
  environment: 'live',
});

// Check environment at runtime
console.log(sandbox.isSandbox);    // true
console.log(sandbox.isProduction); // false
```

The SDK automatically routes to the correct base URL for the chosen environment.

### Flutter / Dart

```dart
import 'package:banzami_sdk/banzami_sdk.dart';

// Sandbox
final client = BanzaClient(
  apiKey:      'bz_test_…',
  environment: BanzamiEnvironment.sandbox,
);

// Production
final client = BanzaClient(
  apiKey:      'bz_live_…',
  environment: BanzamiEnvironment.production,
);

print(client.isSandbox);    // true
print(client.isProduction); // false
```

### Python (example)

```python
import banzami

# Sandbox
client = banzami.Client(
    api_key    = "bz_test_…",
    environment = "sandbox",
)

# Production
client = banzami.Client(
    api_key    = "bz_live_…",
    environment = "live",
)
```

---

## Webhook Testing

Sandbox webhooks fire only for sandbox events. Register a test endpoint:

```http
POST /v1/webhooks/endpoints
Authorization: Bearer <token>
Content-Type: application/json

{
  "url":    "https://your-app.example.com/webhooks/banzami",
  "events": ["transaction.captured", "payout.completed"]
}
```

Then use `POST /v1/sandbox/simulate/payment` to trigger a `transaction.captured` event.

Use a webhook debugging tool (e.g. `webhook.site` or `smee.io`) during local development.

### Verifying webhook signatures

Signature verification works identically in sandbox and live. The `Banza-Signature` header is HMAC-SHA256 of the raw request body using your webhook secret.

```python
import hashlib, hmac

def verify(secret: str, payload: bytes, signature: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

---

## QR Payment Testing

### Static QR

```http
POST /v1/qr/static
Authorization: Bearer <token>
Content-Type: application/json

{"owner_id": "<consumer-id>", "owner_type": "CONSUMER", "currency": "AOA"}
```

Scan the returned `payload` with the Banza consumer app (sandbox mode) to simulate a scan-to-pay flow.

### Dynamic QR (fixed amount)

```http
POST /v1/qr/dynamic
Authorization: Bearer <token>
Content-Type: application/json

{
  "owner_id":     "<consumer-id>",
  "amount_minor": 25000,
  "currency":     "AOA",
  "expires_at":   "2026-06-01T00:00:00Z"
}
```

### QR timeout simulation

Set `expires_at` to a past date to immediately simulate an expired QR code.

---

## Payout Testing

Sandbox payouts never reach real banking rails. Create a payout normally and observe the full status lifecycle:

```http
POST /v1/payouts
Authorization: Bearer <token>
Content-Type: application/json

{
  "wallet_id":           "<wallet-id>",
  "amount_minor":        100000,
  "currency":            "AOA",
  "bank_account_number": "000123456789",
  "bank_code":           "BAI",
  "account_holder_name": "Test Merchant Lda",
  "idempotency_key":     "payout-test-001"
}
```

In sandbox, payouts simulate the full PENDING → PROCESSING → COMPLETED lifecycle within seconds.

---

## Idempotency Testing

All mutating endpoints accept an `Idempotency-Key` header. Submitting the same key twice returns the original response without creating a duplicate:

```bash
# First call — creates transaction
curl -X POST https://sandbox-api.banzami.com/v1/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{"amount_minor": 5000, "currency": "AOA", "idempotency_key": "my-unique-key-001"}'

# Second call — returns the same response (idempotent)
curl -X POST https://sandbox-api.banzami.com/v1/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{"amount_minor": 5000, "currency": "AOA", "idempotency_key": "my-unique-key-001"}'
```

---

## Going to Production

When ready to switch from sandbox to live:

1. **Generate a live API key** — `environment: "LIVE"` in the key creation request.
2. **Update your `BanzaClient` constructor** — change `environment` from `'sandbox'` to `'live'`.
3. **Update environment variables** — replace `bz_test_` key with `bz_live_` key.
4. **Register live webhook endpoints** — sandbox endpoints are not called for live events.
5. **Verify your webhook signature implementation** — run a live test transaction.
6. **Fund your live wallet** — contact Banza operations to activate real balance.

> ⚠️ **Never mix credentials.** A `bz_test_` key will be rejected by the live API gateway. A `bz_live_` key will be rejected by the sandbox. This is enforced at the infrastructure level and cannot be bypassed.

---

## Security Guarantees

| Guarantee | Mechanism |
|---|---|
| Test keys rejected in live | API-gateway middleware validates key prefix against JWT environment claim |
| Live keys rejected in sandbox | Same middleware — cross-environment JWT is rejected with `403 SANDBOX_ONLY` |
| Sandbox data never mixes with live | Separate PostgreSQL databases; `environment` column enforced by `CHECK` constraint |
| Sandbox webhooks stay in sandbox | Webhook delivery filtered by environment at dispatch time |
| Sandbox payouts never hit banking rails | Rust payout engine checks environment before calling acquirer |

---

## Local Development

The `docker-compose.yml` provides isolated sandbox services:

```bash
# Start both live and sandbox stacks
docker compose -f infra/docker/docker-compose.yml up -d

# Live PostgreSQL: localhost:5433
# Sandbox PostgreSQL: localhost:5434

# Live Redis: localhost:6379
# Sandbox Redis: localhost:6380
```

Configure the sandbox api-gateway instance with:

```env
DATABASE_URL=postgres://banzami:banzami_sandbox@localhost:5434/banzami_sandbox
REDIS_URL=redis://localhost:6380
JWT_SECRET=<sandbox-specific-secret>
ENVIRONMENT=sandbox
```

---

## FAQ

**Can I use a real credit card in sandbox?**
No — sandbox processes no real card data. Use the test card numbers listed above.

**Do sandbox transactions appear in live reports?**
Never. The databases are physically separate and records are tagged with `environment = 'SANDBOX'`.

**Are sandbox rate limits the same as live?**
Rate limits are relaxed in sandbox to facilitate automated testing. See the rate limit documentation for specifics.

**Can I test concurrent transactions?**
Yes — submit multiple requests simultaneously using different `idempotency_key` values.

**Do webhook retries work in sandbox?**
Yes — the full retry schedule (1m → 5m → 30m → 2h → 8h) applies in sandbox exactly as in live.
