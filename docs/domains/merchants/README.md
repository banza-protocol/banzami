# Domain: Merchants

**Crate:** `banzami-merchants`  
**Module:** `core/merchants/`

---

## Business Purpose

A merchant is an entity that uses Banzami to accept payments. Every merchant has an identity record, a status that controls whether they can process transactions, and a set of API keys for programmatic access.

This domain handles merchant registration, status management, and the full lifecycle of API key issuance, rotation, and revocation.

---

## Architecture

```
  MerchantEngine
    │
    ├── create(request)               — register a new merchant
    ├── get(merchant_id)              — retrieve merchant details
    ├── suspend(merchant_id)          — halt all operations
    ├── create_api_key(merchant_id)   — issue a new API key
    ├── list_api_keys(merchant_id)    — list active keys
    ├── revoke_api_key(key_id)        — deactivate a key
    └── verify_api_key(raw_key)       — authenticate an API request
```

---

## Merchant Status

```
  Active ──► Suspended ──► Active
```

A suspended merchant cannot process new transactions. Their wallets are frozen. Existing transactions in flight (AUTHORIZED but not captured) are not automatically reversed — they must be explicitly handled by the admin.

---

## API Key Model

API keys are the credential a merchant uses to authenticate with the platform.

### Issuance

1. A random UUIDv4 is generated as the raw key.
2. The raw key is hashed with SHA-256.
3. Only the hash is stored in the `api_keys` table.
4. The raw key is returned once in the API response and never stored again.

### Verification (at login)

```
incoming raw key
  │
  ▼
SHA-256(raw key)
  │
  ▼
SELECT * FROM api_keys WHERE key_hash = $1 AND status = 'ACTIVE'
  │
  ├── found → return merchant_id, scopes
  └── not found → reject (401)
```

### Scopes

Each API key carries a set of scopes that constrain what it can do:

| Scope                  | Permission                        |
|------------------------|-----------------------------------|
| `transactions:write`   | Create and manage transactions    |
| `transactions:read`    | List and retrieve transactions    |
| `wallets:write`        | Provision wallets                 |
| `wallets:read`         | Read wallet balances              |
| `payouts:write`        | Request payouts                   |
| `webhooks:write`       | Register webhook endpoints        |
| `*`                    | All permissions (admin tokens)    |

### Rotation

A merchant can have multiple active API keys simultaneously. The recommended rotation pattern:

1. Create new key.
2. Deploy new key to servers.
3. Revoke old key.

This allows zero-downtime rotation without a flag day.

---

## Invariants

1. A merchant must have at least one `Active` API key to authenticate. Revocation of the last key locks the merchant out — intentional.
2. API key hashes are stored with a UNIQUE constraint. Two different raw keys cannot produce the same hash (SHA-256 collision resistance).
3. A suspended merchant's API keys remain in the database but `verify_api_key` returns an error if the merchant is not `Active`.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Invalid or unknown API key | `401 Unauthorized` — no information about which part is wrong |
| Key for suspended merchant | `403 Forbidden` |
| Creating a merchant with duplicate name | `409 Conflict` |
| Revoking an already-revoked key | `404 Not Found` |

---

## Security Assumptions

- The plaintext API key is never logged, stored, or returned after the creation response. If lost, the merchant must create a new key.
- A database breach exposes hashes, not usable keys. SHA-256 preimage resistance means hashes cannot be reversed.
- Key scopes are enforced at the Go gateway layer (`middleware.RequireScope`). The core-api trusts the authenticated merchant_id but does not re-check scopes.
