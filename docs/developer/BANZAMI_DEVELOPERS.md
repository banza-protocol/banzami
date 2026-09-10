# Banzami Developers

Version: 1.0

> **Availability.** Banzami Developers is currently documented for controlled Sandbox and
> regulatory preparation purposes. Public real-money availability depends on the applicable
> regulatory, operational and payment-rail activation conditions.
>
> **Scope of this document.** It reflects only what has been proven in the internal Sandbox
> Developer Platform E2E evidence
> ([DEVELOPER_PLATFORM_E2E_RESULTS.md](../../evidence/developer-platform/DEVELOPER_PLATFORM_E2E_RESULTS.md),
> [.json](../../evidence/developer-platform/DEVELOPER_PLATFORM_E2E_RESULTS.json),
> [GAP_MATRIX](../../evidence/developer-platform/DEVELOPER_PLATFORM_E2E_GAP_MATRIX.md)):
> **PASS 15 · FAIL 0 · SIMULATED 1 · DEFERRED 0 · BLOCKED 1 · total 17.** Anything not
> proven there is described as planned, simulated or not-in-scope — never as available.
> All examples use placeholders; no real endpoints, keys, tokens or hostnames appear.

---

## 1. Overview

Banzami Developers is a developer layer for integrating Banzami payments by QR, payment
link, payment intent and API/SDK, with verifiable receipts, signed events and
reconciliation. A platform or integrator initiates payment requests and receives technical
state; Banzami owns the ledger, payment state, receipts and reconciliation.

Positioning — what a platform/integrator does and does **not** do:

| A platform / integrator … | Banzami … |
|---|---|
| initiates payment requests (links, intents, checkout) | holds and moves money in the ledger |
| receives technical payment state and signed events | calculates balances from the double-entry ledger |
| stores its own references (order/booking/seller IDs) | issues the financial receipt of record |
| reconciles its records against Banzami state | executes settlement |

A platform/integrator **does not** hold money, **does not** calculate balances, **does not**
issue financial receipts and **does not** execute settlement. It relies on Banzami for the
ledger, payment state, receipts and reconciliation.

The Developer Platform **API/SDK lifecycle** is E2E-verified in the internal Sandbox. A
visual **Developer Console** is not yet part of the tested scope (see §16 and §17).

## 2. Sandbox concept

The Sandbox is an isolated, synthetic environment for building and testing an integration
without moving real money. Confirmations, failures, refunds and webhooks are simulated.
Sandbox keys are prefixed for the environment (for example `bz_test_xxx`) and are isolated
from any real environment.

Proven in the Sandbox E2E: authenticate → use a workspace + project → mint and use an API
key → enforce scope → create a payment link and a payment intent → complete an online
checkout → verify a receipt → reconcile → revoke a key and be rejected → be rejected on
invalid/unauthorised access, with no ledger/balance mutation on any rejection and an audit
trail recorded.

## 3. Workspaces

A workspace is the top-level container for an integrator's projects, members and keys. In
the Sandbox E2E a workspace is available to the authenticated developer/platform context
(F0-DP-002) and scopes the projects and keys created beneath it.

## 4. Projects

A project groups the configuration and keys for one integration under a workspace. In the
Sandbox E2E a project is available under the workspace (F0-DP-003) and is the unit that a
payment link, payment intent and API key are associated with. Project creation is recorded
in the audit trail (F0-DP-016).

A project can take keys and integrate without anything else. To **receive** money it needs
a verified Business, which it gets on the Console page *Configuração financeira*: either by
applying for a new Business (the same application and operator review as any Banzami
Business) or by connecting an existing one with the single-use code that Business issues
from its app. See [merchant onboarding](../domains/merchant-onboarding/README.md#onboarding-surface-a-developer-project-developers-console).

## 5. API keys and scopes

API keys authenticate server-side requests. Each key carries **scopes** that bound what it
may do (for example `payment_sessions:write`, `payment_sessions:read`,
`payment_links:write`, `payment_links:read`, `identity:read`).

Proven in the Sandbox E2E:

- an **active** key is accepted (F0-DP-004);
- a key used **outside its scope** is rejected with `403 INSUFFICIENT_SCOPE` (F0-DP-005);
- an **invalid** key is rejected with `401` (F0-DP-013);
- a **revoked** key is rejected with `401` (F0-DP-012, see §12).

Secret keys are backend-only. Never place a secret key in a browser, mobile app or any
client-side code. Example (placeholder):

```http
POST /v1/payment-sessions
Host: api.example.banzami.test
Authorization: Bearer bz_test_xxx
Idempotency-Key: payment_intent_example
```

## 6. Payment links

A payment link is a shareable request for payment created from the platform/project context.
In the Sandbox E2E a payment link is created and available (F0-DP-006). Example
(placeholder):

```http
POST /v1/payment-links
Host: api.example.banzami.test
Authorization: Bearer bz_test_xxx
Idempotency-Key: payment_link_example

{ "amount_minor": 50000, "currency": "AOA", "reference": "payment_link_example" }
```

## 7. Payment intents

A payment intent represents an intended payment that resolves to a technical state as it
progresses. In the Sandbox E2E a payment intent is created from the platform context and
returns a pending state (F0-DP-007). Example (placeholder):

```http
POST /v1/payment-sessions
Host: api.example.banzami.test
Authorization: Bearer bz_test_xxx
Idempotency-Key: payment_intent_example

{ "amount_minor": 40000, "currency": "AOA" }
```

## 8. Online checkout

Online checkout is the consumer-facing completion of a payment (for example paying by QR).
In the Sandbox E2E an online checkout **completes** (status COMPLETED) with a correct
double-entry ledger movement, and an **idempotent retry does not double-charge**
(F0-DP-008). Always wait for the completed/confirmed technical state (or a verified webhook)
before releasing goods or services.

## 9. Receipt verification

Every completed payment produces a **verifiable receipt reference** issued by Banzami. In
the Sandbox E2E the receipt is verifiable, reflects the correct state, respects privacy
(consumer identity shown as `@handle` only) and is **non-fabricable** — a forged reference
resolves to `exists=false` (F0-DP-009). Platforms verify receipts against Banzami rather
than issuing their own financial receipt.

## 10. Reconciliation

Reconciliation compares what a platform created against what Banzami settled. In the Sandbox
E2E, created-vs-settled-vs-balance reconciliation shows **zero discrepancy** (F0-DP-010).
The double-entry ledger — not any platform-side calculation — is the source of truth for
balances.

## 11. Webhooks and signatures

Banzami emits signed events so a backend does not have to poll. The signing convention is
the BANZA protocol wire contract: the `banza-signature` header (HMAC-SHA256) over the
payload, with retry/backoff and idempotency.

Sandbox E2E status — **SIMULATED** (F0-DP-011): the event-emission pipeline is reachable and
the signing, retry/backoff and idempotency contract is verified in code and unit tests.
**Live outbound delivery to a public HTTPS endpoint is excluded from Phase 0** (it requires
a public HTTPS sink, which is outside the internal Sandbox). Verify the `banza-signature`
of every event before acting on it. Webhook signing secrets are placeholders such as
`whsec_test_xxx` and are backend-only.

## 12. API key revocation

A key can be revoked; after revocation it must no longer authenticate. In the Sandbox E2E a
key is **genuinely revoked** and a subsequent request with it is rejected with `401`
(F0-DP-012). Revocation is recorded in the audit trail (F0-DP-016).

## 13. Invalid, revoked and unauthorised access handling

Rejections are deterministic and safe:

| Condition | Result | Evidence |
|---|---|---|
| Invalid API key | `401` | F0-DP-013 |
| Revoked API key | `401` | F0-DP-012 |
| Missing/Unauthorised platform | `401` | F0-DP-014 |
| Key used outside its scope | `403 INSUFFICIENT_SCOPE` | F0-DP-005 |

On **every** rejection there is **no ledger and no balance mutation** (merchant and payer
balances are identical before and after all rejections, F0-DP-015) and **no receipt is
fabricated**.

## 14. Error codes

Errors are structured. Codes proven or referenced by the Sandbox E2E and the API surface:

| Code | Meaning |
|---|---|
| `INSUFFICIENT_SCOPE` | The API key lacks a scope required by the route (`403`). |
| `UNAUTHORIZED` | Missing, invalid or revoked credentials (`401`). |
| `PAYMENTS_UNAVAILABLE` | The project is not provisioned to accept payments. |
| `NOT_FOUND` | The referenced object (e.g. a receipt reference) does not exist. |
| `idempotency_conflict` | An idempotency key was reused with a different body. |

## 15. Platform responsibilities

For a robust, safe integration a platform/integrator should:

- store the payment/session IDs for each operation;
- send an idempotency key on every mutating operation;
- verify the `banza-signature` of every webhook before acting on it;
- act only on the completed/confirmed technical state before releasing goods;
- handle failed, expired and refunded states;
- never rely on client-side confirmation alone;
- keep secret keys backend-only and never expose them to a browser or mobile client;
- record request IDs for diagnostics.

## 16. Current limitations

- **Webhook outbound delivery — SIMULATED.** Signing, retry/backoff and idempotency are
  verified; delivery to a public HTTPS sink is excluded from Phase 0 (§11).
- **Developer Console UI — BLOCKED / not in tested scope.** No Developer Console frontend
  application exists in the repository, so a browser/UI E2E cannot be run and is not faked
  with API tests. Developer Platform API/SDK flows have been validated in the internal
  Sandbox; a visual Developer Console is planned separately and is **not** claimed as
  available in this documentation.
- **Live/production** payment execution and external rails are out of scope here (§17).

## 17. Availability and regulatory disclaimer

Banzami Developers is currently documented for controlled Sandbox and regulatory
preparation purposes. Public real-money availability depends on the applicable regulatory,
operational and payment-rail activation conditions.

This document does **not** claim: public availability, production-readiness, LIVE operation,
BNA approval or admission to any BNA sandbox, active real payments, active EMIS or external
provider activation, or an available Developer Console. Banzami is the reference operator on
the open BANZA protocol; the protocol is governed independently.
