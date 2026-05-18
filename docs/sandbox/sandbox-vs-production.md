# Sandbox vs Production

Banzami maintains strict environment isolation. Mixing sandbox and production is a hard error.

## Environment Variables

| Variable              | Sandbox/Dev              | Production              |
|-----------------------|--------------------------|-------------------------|
| `APP_ENV`             | `development` (default)  | `production`            |
| `ACQUIRING_PROVIDER`  | (unset = SIMULATED)      | `EMIS`                  |
| `ACQUIRING_WEBHOOK_SECRET` | dev secret          | EMIS-issued HMAC secret |
| `EMIS_API_URL`        | not needed               | EMIS production URL     |
| `EMIS_API_KEY`        | not needed               | EMIS API key            |
| `EMIS_ENTITY`         | not needed               | EMIS entity number      |

## Boot Safety Guard

The Rust core API refuses to start if:
```
APP_ENV=production AND ACQUIRING_PROVIDER != EMIS
```
This prevents accidentally deploying simulated payments to production.

## Provider Behaviour

### SimulatedProvider (sandbox/development)
- Generates realistic 9-digit Multicaixa reference numbers
- Signs callbacks with HMAC using `ACQUIRING_WEBHOOK_SECRET`
- No external HTTP calls — fully deterministic
- Supports `test-confirm` endpoints for instant settlement simulation
- Can be triggered from admin tools / Postman

### EMISProvider (production)
- Calls the live EMIS Multicaixa Express API
- Validates inbound HMAC signatures from EMIS
- `initiate_payment()` currently stubbed — pending EMIS API access grant
- Production webhook URL registered with EMIS

## API Keys and Environment

Banzami API keys are prefixed to indicate environment:
- `bz_test_...` → Sandbox keys → routed to SimulatedProvider
- `bz_live_...` → Production keys → routed to EMISProvider

**Rule**: Secret API keys NEVER appear in frontend, mobile, or browser code.

## Admin Manual Credit (Beta Funding)

For TestFlight beta and pilot merchants, use the admin credit endpoint to seed wallets:

```
POST /admin/v1/wallets/{wallet_id}/credit
Authorization: Bearer <admin-key>
{
  "amount_minor": 5000000,
  "currency": "AOA",
  "reason": "TestFlight beta funding — pilot merchant onboarding"
}
```

- Reason field is required and embedded in the ledger posting description
- No cap — admin-only, protected by admin API key auth
- Creates auditable double-entry in the ledger

## Sandbox Credit (Sandboxed Merchants)

For sandboxed merchant accounts (QA, testing), use:
```
POST /internal/v1/wallets/{wallet_id}/sandbox-credit
```
Capped at 100,000,000 AOA per request. Intended for API gateway sandbox handler only.

## TestFlight Notes

TestFlight builds connect to **production** core API with **SimulatedProvider** active. This means:
- Real authentication, real accounts, real data
- Simulated payments only (no real money moves via EMIS)
- Admin credits can seed merchant wallets for beta testing
- Consumer deposits work end-to-end in simulation mode
