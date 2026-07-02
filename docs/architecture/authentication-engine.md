# Authentication Engine — how an application authenticates with Banzami

**Status:** Implemented · **Version:** 1.0 · **Part of:**
[application-integration-engine.md](application-integration-engine.md) ·
**Decision:** [ADR-032](../adr/ADR-032-application-integration.md)

## Purpose

Establish *who* is calling and *which business* they may act on — before any
resolution, pricing, payment or settlement. Authentication is the first gate in
the [gateway](application-integration-engine.md#1-overview); everything downstream
trusts its result.

## Credentials

| Credential | Where it lives | Use |
|---|---|---|
| **Secret API key** (`bz_test_* / bz_live_*`) | server-side only (never in browser/mobile client) | server SDK → exchanged for a JWT |
| **Publishable key** | client SDK | client-side, non-secret operations |
| **JWT (bearer)** | short-lived, issued by the operator | every gateway call |

The SDK performs the exchange (`POST /v1/auth/token` with the API key → bearer
JWT), refreshes it, and attaches `Authorization: Bearer <jwt>` automatically. The
application never handcrafts this.

## Guarantees enforced at this layer

- **Business isolation** — a key resolves to exactly one Business; the gateway
  rejects any attempt to touch another business's wallet, accounts or sessions.
- **Environment binding** — a sandbox key only works against
  `sandbox-api.banzami.com`, a live key only against `api.banzami.com`
  ([ADR-025](../adr/ADR-025-platform-mode-environment-router.md)). A mismatch is
  rejected, not silently accepted.
- **Rate limiting** per key; **idempotency keys** on mutating calls; structured
  request logging with a `request_id`.

## Webhooks (operator → application)

The operator calls the application back for asynchronous events
(`payment_session.paid`, `application_settlement.*`, …). Each request carries the
`banza-signature` header, signed with `BANZA_WEBHOOK_SECRET`. **Verify with the
SDK** (`webhooks.constructEvent`) — never parse/trust an unsigned body. This is a
protocol-level wire contract (see [brand architecture / ADR-025](../adr/ADR-025-platform-mode-environment-router.md)).

## Rules

- Secret keys never ship in frontend, browser or mobile client code.
- Rotate keys via the operator; a rotated key invalidates the old JWT path.
- On `401` the SDK re-authenticates once; a persistent `401` (e.g. a revoked
  handle-login JWT) signs the session out — the app routes back to login.

See also: [security/](../security/), [business-resolution-engine.md](business-resolution-engine.md).
