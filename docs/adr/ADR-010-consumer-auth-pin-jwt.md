# ADR-010 — Consumer Authentication: PIN + JWT

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

ADR-003 defined authentication for **merchants** (API key → JWT) and **admin operators** (static key). A third authentication surface now exists: **consumers** — end users who scan QR codes, pay payment links, and transfer money via the Banzami mobile app or public-api.

Consumer authentication requirements differ from merchant authentication:

- Consumers are human, not servers.
- Consumers authenticate interactively on mobile devices.
- Credentials must be memorable (no 40-character API key).
- The session token must work from mobile apps and browsers.

Angola context: most consumers are mobile-first, accustomed to PIN-based mobile money (Multicaixa, M-Pesa). A PIN model aligns with existing mental models and requires no biometric infrastructure.

---

## Decision

**Consumers authenticate with a handle + 4–8 digit PIN. Successful authentication issues a JWT with a `customer_id` claim and a 24-hour TTL.**

### Credential storage

PIN hashes are stored in `public_api_credentials` (a table owned by `services/public-api`), separate from all financial data.

```sql
CREATE TABLE public_api_credentials (
    consumer_id UUID PRIMARY KEY REFERENCES consumers(id),
    handle      VARCHAR(30) UNIQUE NOT NULL,
    pin_hash    TEXT NOT NULL,       -- bcrypt, cost=10
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The PIN is hashed with bcrypt (cost 10) before storage. The plaintext PIN is never stored or logged.

### JWT claims

```json
{
  "customer_id": "550e8400-e29b-41d4-a716-446655440000",
  "scopes": ["consumer"],
  "iat": 1748000000,
  "exp": 1748086400
}
```

The same HS256 `JWT_SECRET` used for merchant tokens is used. The `customer_id` claim distinguishes consumer tokens from merchant tokens (`merchant_id`). Both claims are optional in the `jwtClaims` struct; only one is ever set per token.

### Auth flow

```
POST /v1/auth/register
  Body: { handle, display_name?, pin }
  1. Validate handle (3–30 chars) and PIN (4–8 digits)
  2. Create consumer in core-api → assigns consumer_id
  3. bcrypt(pin) → store in public_api_credentials
  4. Auto-provision AOA wallet in core-api
  5. Return { consumer, token, expires_at }

POST /v1/auth/token
  Body: { handle, pin }
  1. SELECT * FROM public_api_credentials WHERE handle = $1
  2. bcrypt.CompareHashAndPassword(stored_hash, pin)
  3. Return { token, expires_at }
```

---

## Rationale

### Why PIN and not password?

Angola's target consumer base is mobile-money-native. PINs (4–8 digits) are the de-facto standard across Multicaixa, M-Pesa, and bank mobile apps. A full alphanumeric password would create friction and support burden. PINs also work equally well on feature phones with numeric keypads.

### Why handle and not phone number?

A handle (`@joao`, `@mercearia_da_rosa`) is:
- Memorable and shareable (enables "send to `@joao`" UX).
- Not tied to a SIM card (consumers change numbers; losing a handle would be a product failure).
- Simpler to implement (no SMS OTP infrastructure required for V1).

Phone number + OTP is the long-term evolution once BNA compliance requires identity verification, but it is not required for MVP.

### Why store credentials in public-api and not in the Rust core?

The Rust core owns all **financial** data (accounts, ledger, wallets, transfers). Consumer credentials are an **authentication** concern, not a financial one. Mixing them into the core would:
- Couple the Go auth layer to the Rust financial core.
- Require adding bcrypt or Argon2 to the Rust dependency graph.
- Force the core to understand sessions and tokens.

The credential table is a single small table (`public_api_credentials`) with a foreign key to `consumers`. It is owned entirely by the public-api service.

### Why 24-hour JWT TTL (versus 1 hour for merchants)?

Consumers are interactive mobile users. A 1-hour TTL would force re-authentication during a shopping session, which degrades UX significantly. 24 hours balances security (limited exposure window) against usability. Merchant tokens are shorter because server-to-server clients can silently re-authenticate; mobile users cannot.

### Why not OAuth 2.0 / OIDC?

See ADR-003 for the general rationale. For consumers specifically: the complexity of an OIDC provider (authorization server, client registration, token introspection) is not justified for a self-contained mobile product at MVP scale. If Banzami ever becomes an identity provider for third-party apps, OIDC is the correct evolution path.

---

## Consequences

**Positive:**
- Familiar UX for Angolan mobile-money users.
- No SMS OTP infrastructure required (cost and complexity).
- Handles are shareable and enable discovery within the platform.
- Financial data and credential data are cleanly separated.

**Negative:**
- PIN-only auth is weaker than OTP for account recovery. PIN reset requires an out-of-band channel (email or phone) — not implemented in V1.
- 24-hour TTL means a stolen device has a wider window than merchant tokens.
- If a consumer forgets their PIN, recovery requires manual support intervention in V1.

---

## Future Work

- **Phone number + OTP:** for BNA identity verification compliance, binding a verified phone number to a consumer account.
- **Biometric auth:** Flutter SDK can use `local_auth` for fingerprint/face unlock as a PIN replacement on supported devices.
- **PIN reset flow:** self-service recovery via SMS OTP or email link.
- **JWT revocation:** Redis blocklist for immediate token invalidation on logout or compromise.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Phone + SMS OTP | Requires SMS gateway infrastructure; cost and complexity; deferred to V2 |
| Email + password | Low mobile penetration in target market; no email culture in informal commerce |
| Biometric-only | Requires device biometric support; fallback PIN needed anyway |
| API key for consumers | Not user-friendly; not suitable for interactive mobile sessions |
| OAuth 2.0 PKCE | Redirect flows add friction on mobile; no third-party client use case in V1 |
