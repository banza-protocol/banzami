# Doa × Banza — Sandbox Integration

The official guide for integrating and testing with the Banza sandbox environment.

---

## What is the Sandbox?

The Banza sandbox is a complete replica of the production environment — same API surface, same state machines, same webhook retry logic, same signature verification — but no real money ever moves. Virtual AOA balances can be created freely for testing.

**Banza sandbox URLs**:

| Service | URL |
|---------|-----|
| API Gateway | `https://sandbox-api.banzami.com` |
| Business Dashboard | `https://sandbox-dashboard.banzami.com` |
| Pay Page | `https://pay.banzami.com` (same domain — sandbox links are isolated by environment) |

---

## API Key Prefix as Environment Signal

The environment is encoded in the API key prefix:

```
bz_live_<random>  →  Production (real money)
bz_test_<random>  →  Sandbox (virtual money)
```

Banza enforces this at the gateway — a `bz_test_` key is rejected by the live gateway and vice versa. The environment is also embedded as a signed `environment` claim in the JWT, making cross-environment token reuse impossible.

**Doa reads the prefix at startup**:

```typescript
// lib/payments/providers/banzami.ts
const API_KEY    = process.env.BANZAMI_API_KEY ?? '';
const IS_SANDBOX = API_KEY.startsWith('bz_test_');

class BanzamiProvider implements PaymentProvider {
  readonly sandbox      = IS_SANDBOX;
  readonly display_name = IS_SANDBOX ? 'Banzami (Sandbox)' : 'Banzami';
  // ...
}
```

This flag propagates to the donor UI as a visual badge — see [frontend-integration.md](frontend-integration.md).

---

## Environment Variables for Sandbox

```env
# Sandbox configuration
BANZAMI_GATEWAY_URL=https://sandbox-api.banzami.com
BANZAMI_API_KEY=bz_test_your_sandbox_key_here
BANZAMI_MERCHANT_ID=your-test-merchant-uuid
BANZAMI_WALLET_ID=your-test-wallet-uuid
BANZAMI_PAY_BASE_URL=https://pay.banzami.com

# Enable Banzami in the method picker
PAYMENT_PROVIDERS=stripe,bank-transfer,banzami
```

No other code changes are needed. The `bz_test_` prefix is the only switch.

---

## Getting a Sandbox Account

1. Visit `https://sandbox-dashboard.banzami.com` and register a sandbox merchant.
2. The admin dashboard auto-approves KYB for sandbox accounts.
3. A `bz_test_` API key is issued and emailed.
4. Create a sandbox wallet via the dashboard or API:

```bash
# Authenticate
curl -X POST https://sandbox-api.banzami.com/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{ "api_key": "bz_test_your_key" }'
# → { "token": "eyJ..." }

# Create AOA wallet
curl -X POST https://sandbox-api.banzami.com/v1/wallets \
  -H "Authorization: Bearer $SANDBOX_JWT" \
  -d '{ "merchant_id": "mer_...", "currency": "AOA" }'
# → { "id": "wlt_..." }
```

5. Copy the merchant ID and wallet ID to `.env.local`.

---

## Funding a Sandbox Wallet

Sandbox wallets start with zero balance. Fund them using the sandbox endpoint:

```bash
curl -X POST https://sandbox-api.banzami.com/v1/sandbox/fund \
  -H "Authorization: Bearer $SANDBOX_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_id": "wlt_...",
    "amount_minor": 100000000,
    "currency": "AOA"
  }'
```

Maximum: 100,000,000 centavos (1,000,000.00 AOA) per call. No daily limit.

---

## Simulating a QR Payment

### Method 1: Sandbox dashboard

1. Open `https://sandbox-dashboard.banzami.com`
2. Navigate to **Payment Links**
3. Find the link created by Doa (description: `DOA-{prefix}`)
4. Click **Simulate Payment**

Banza marks the link as `USED` and fires any registered webhook endpoints.

### Method 2: API call

```bash
curl -X POST https://sandbox-api.banzami.com/v1/payment-links/{link_id}/mark-used \
  -H "Authorization: Bearer $SANDBOX_JWT"
```

This is equivalent to a donor scanning the QR and confirming in the Banzami app.

### Method 3: Sandbox simulate endpoint

For simulating specific outcomes (not yet available for payment links, currently for card transactions):

```bash
curl -X POST https://sandbox-api.banzami.com/v1/sandbox/simulate/payment \
  -H "Authorization: Bearer $SANDBOX_JWT" \
  -d '{
    "wallet_id":    "wlt_...",
    "amount_minor": 150000,
    "currency":     "AOA",
    "scenario":     "success"
  }'
```

Valid scenarios: `success`, `insufficient_funds`, `fraud_blocked`.

---

## Sandbox Instruments (Test Numbers and Cards)

The sandbox supports test instruments that trigger specific outcomes. Retrieve the current list:

```bash
curl https://sandbox-api.banzami.com/v1/sandbox/instruments \
  -H "Authorization: Bearer $SANDBOX_JWT"
```

**Standard test numbers**:

| Phone / identifier | Outcome |
|--------------------|---------|
| `+244 900 000 001` | Payment succeeds |
| `+244 900 000 002` | Insufficient funds |
| `+244 900 000 003` | Payment declined |

**Test cards** (for card-based flows):

| Card number | Outcome |
|-------------|---------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Insufficient funds |
| `4100 0000 0000 0019` | Fraud blocked |

Use expiry `12/30`, CVV `123` for all test cards.

---

## Sandbox Webhook Testing

Webhook verification uses the same HMAC-SHA256 algorithm in sandbox — the sandbox secret (`whsec_...`) returned at endpoint registration works identically to the live secret.

```bash
# Register sandbox webhook endpoint (local dev with ngrok tunnel)
curl -X POST https://sandbox-api.banzami.com/v1/webhooks/endpoints \
  -H "Authorization: Bearer $SANDBOX_JWT" \
  -d '{
    "url":    "https://your-tunnel.ngrok.io/api/webhooks/banzami",
    "events": ["payment_link.paid"]
  }'
# → { "secret": "whsec_...", ... }
```

Set `BANZAMI_WEBHOOK_SECRET=whsec_...` in `.env.local` and restart.

Simulate a payment to trigger the webhook:

```bash
curl -X POST https://sandbox-api.banzami.com/v1/payment-links/{id}/mark-used \
  -H "Authorization: Bearer $SANDBOX_JWT"
```

Your server logs should show:
```
{ action: 'api.webhooks.banzami', type: 'payment_link.paid', ... }
banzami_webhook_ok { intent_id: '...', deduped: false }
```

---

## Environment Isolation Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| `bz_test_` keys rejected in production | Banza gateway validates key prefix against environment claim |
| `bz_live_` keys rejected in sandbox | Same middleware — `403 LIVE_ONLY` returned |
| Sandbox payment links can't be paid with live app | Link environment encoded in Banza's data model |
| Sandbox webhooks only delivered to sandbox endpoints | Delivery filtered by endpoint environment at dispatch |
| No sandbox data visible in live dashboard | Separate databases in Banza's infrastructure |

---

## Sandbox UI — SANDBOX Badge

When `IS_SANDBOX = true`, the `BanzamiPanel` shows a visual badge:

```
┌─────────────────────────────────┐
│ Paga com o Banzami    [SANDBOX] │  ← amber badge
│                                  │
│ [QR code]                        │
│ ...                              │
└─────────────────────────────────┘
```

This makes it immediately obvious during development and QA that the integration is running against sandbox. The badge disappears when `BANZAMI_API_KEY=bz_live_...` is set.

---

## Going to Production

See [production-checklist.md](production-checklist.md) for the complete transition procedure.

**Key steps**:

1. Replace `bz_test_` API key with `bz_live_` key.
2. Replace `BANZAMI_GATEWAY_URL` with `https://api.banzami.com`.
3. Replace merchant/wallet IDs with production values.
4. Register a new webhook endpoint against the production API and update `BANZAMI_WEBHOOK_SECRET`.
5. Verify the `SANDBOX` badge is gone from the Banza method picker.
6. Run a real end-to-end test with a small amount before enabling for all campaigns.
