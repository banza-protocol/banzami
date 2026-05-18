# Acquiring Domain

Acquiring handles the integration with external payment networks (EMIS Multicaixa Express) for merchant payment collection. It bridges Banzami payment links to the acquirer and processes confirmation callbacks.

## Architecture

```
Customer scans QR / opens payment link
        ↓
POST /internal/v1/acquiring/payments   ← initiate_payment()
        ↓
Provider returns external_ref + instructions
        ↓
Customer pays via Multicaixa Express app
        ↓
EMIS sends HMAC-signed callback
        ↓
POST /internal/v1/acquiring/callbacks/emis
        ↓
process_callback() → confirm acquiring_payment
        ↓
Wallet credit: system:transit DR / wallet:available CR
```

## Provider Strategy

Provider is selected at boot via `ACQUIRING_PROVIDER` env var:

| Value      | Provider           | Use case                        |
|------------|--------------------|---------------------------------|
| (default)  | `SimulatedProvider`| Development, sandbox, TestFlight |
| `EMIS`     | `EMISProvider`     | Production (requires EMIS credentials) |

**Safety guard**: The server refuses to boot if `APP_ENV=production` and `ACQUIRING_PROVIDER` is not `EMIS`. This prevents accidental production deployment with simulated payments.

## Tables

### `acquiring_payments`
Tracks one payment attempt per payment link. States:
- `PENDING` → payment initiated, awaiting customer action
- `CONFIRMED` → callback received and validated
- `FAILED` → payment failed or expired

### `acquiring_callbacks`
Stores the raw callback payload for every inbound event. Provides:
- **Audit trail**: full callback body + signature preserved
- **Idempotency**: `UNIQUE` on `idempotency_key` prevents double-processing

## Wallet Settlement on Callback

When a callback confirms a payment (`CONFIRMED`), the acquiring route immediately:
1. Checks idempotency (`ledger_postings.idempotency_key = "acquiring-settle-{payment_id}"`)
2. Looks up `payment_links.wallet_id` from the acquiring payment
3. Posts double-entry:
   - **DR** `system:transit` (ASSET) — acquirer paid Banzami
   - **CR** `wallet:available` (LIABILITY) — merchant can now withdraw

This is idempotent: duplicate callbacks are ignored via `ON CONFLICT (idempotency_key) DO NOTHING`.

## Simulation (Development)

```bash
# 1. Initiate a payment (returns external_ref)
POST /internal/v1/acquiring/payments
{ "payment_link_id": "...", "amount_minor": 500000, "currency": "AOA" }

# 2. Simulate EMIS confirming the payment
POST /internal/v1/acquiring/test/confirm?external_ref=<ref>
```

## Production EMIS Integration

Set these env vars:
```
ACQUIRING_PROVIDER=EMIS
EMIS_API_URL=https://api.emis.ao/...
EMIS_API_KEY=...
EMIS_ENTITY=11333
ACQUIRING_WEBHOOK_SECRET=<shared-hmac-secret-from-EMIS>
APP_ENV=production
```

`EMISProvider.initiate_payment()` currently stubs with a TODO — full HTTP integration pending EMIS API access grant.

## Invariants

- Every wallet credit is preceded by an acquiring_payment confirmation in the same database
- A wallet is never credited twice for the same acquiring_payment (idempotency_key uniqueness)
- Callbacks are validated via HMAC-SHA256 before any state change
- Wallet credit failures are logged but do not fail the HTTP response (callback acknowledged)
