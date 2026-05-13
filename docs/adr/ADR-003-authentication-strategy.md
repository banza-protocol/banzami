# ADR-003 — Authentication Strategy

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Banzami has two distinct authentication surfaces:

1. **Merchant API access** — merchants integrate programmatically. They need a stable long-lived credential for their servers and a short-lived token for individual requests.
2. **Admin operations** — internal operators approve compliance, manage settlements, and trigger reconciliation. This surface must never be reachable from the internet.

The question is: what authentication mechanism to use for each surface, and why?

---

## Decision

**Merchants:** API key (long-lived) exchanged for a short-lived JWT at the `/v1/auth/token` endpoint. All subsequent requests carry the JWT as a Bearer token.

**Admin operators:** Static shared secret delivered via `X-Admin-Key` header (or `Authorization: Bearer`). Network isolation (not internet-reachable) is the primary control.

**Core-api:** No authentication. Network isolation (loopback only) is the control.

---

## Architecture

```
Merchant server
  │
  ├─ POST /v1/auth/token
  │    Header: X-Api-Key: <api-key>
  │    Response: { token: "eyJ...", expires_in: 3600 }
  │
  └─ POST /v1/transactions
       Header: Authorization: Bearer eyJ...
       (JWT verified by api-gateway middleware)

Admin operator (internal network only)
  │
  └─ POST /admin/v1/compliance/merchants/{id}/approve
       Header: X-Admin-Key: <static-secret>
       (verified by admin-api middleware)
```

### API Key storage

API keys are random UUIDs. Only the SHA-256 hash is stored in PostgreSQL. The plaintext is returned once at creation and never stored. A compromised database does not expose usable API keys.

### JWT claims

```json
{
  "merchant_id": "...",
  "scopes": ["transactions:write", "wallets:read"],
  "exp": 1748000000,
  "iat": 1747996400
}
```

HS256 signed with `JWT_SECRET`. TTL: 1 hour.

---

## Rationale

### Why API key → JWT and not API key on every request?

Verifying an API key on every request requires a database lookup (to retrieve and compare the stored hash). JWTs are self-contained and verified in memory with a single HMAC check. This eliminates per-request DB latency on the authentication hot path.

The API key is long-lived and stable — suitable for storing in environment variables on the merchant's server. The JWT is short-lived — if leaked in a log or a network capture, it expires quickly.

### Why HS256 and not RS256?

RS256 requires a public/private key pair and enables token verification without the signing secret (useful for multi-service token verification). At the current scale, all JWT verification happens inside the single api-gateway process. The complexity of key pair management (rotation, distribution) is not justified. HS256 is simpler and sufficient.

RS256 is the correct choice if external services or third parties ever need to verify Banzami-issued tokens independently.

### Why not OAuth 2.0 / OIDC?

OAuth 2.0 is designed for delegated authorisation — where a user grants a third party access to their resources. Banzami's merchant API is a server-to-server integration: the merchant is both the resource owner and the authorised party. OAuth 2.0 adds redirect flows, token introspection endpoints, and client registration complexity that provides no benefit in this model.

OIDC adds identity federation on top of OAuth 2.0. Banzami does not need to federate identities from external providers at this stage.

### Why static key for admin and not JWT?

Admin operations are infrequent, performed by internal operators, and the surface is not internet-reachable. A full API key → JWT flow for admin adds ceremony without improving security meaningfully when network isolation is already the primary control.

If the admin surface ever becomes internet-reachable (e.g., for a hosted admin SaaS), this decision must be revisited with proper RBAC and MFA.

### Why no authentication on the core-api?

The core-api binds only to the loopback address (`127.0.0.1:8081`) and is firewalled at the network level. Any process that can reach it is already inside the trusted boundary. Adding an authentication layer would require distributing a shared secret between Go services and the Rust core, adding latency and operational complexity for no security improvement given the network control.

---

## Consequences

**Positive:**
- Fast JWT verification (no DB per request on the hot path).
- API key compromise is limited by JWT TTL.
- Simple admin auth appropriate for the internal-only surface.
- API key hashing means a database breach does not yield usable credentials.

**Negative:**
- JWT revocation before expiry is not possible without a blocklist (Redis). Not implemented; acceptable given 1-hour TTL.
- Static admin key rotation requires a service restart (env var change). Acceptable for now; secret manager integration is the long-term solution.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| API key on every request | DB lookup on hot path; latency |
| OAuth 2.0 | Server-to-server context; unnecessary complexity |
| mTLS between services | Operational overhead; certificate management; overkill for loopback |
| RS256 JWT | Key pair management complexity not justified at current scale |
| Session cookies | REST API, not browser-first; stateful |
