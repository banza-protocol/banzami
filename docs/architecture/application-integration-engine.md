# Application Integration Engine — how any application integrates with Banzami

**Status:** Implemented · **Version:** 1.0 · **Audience:** internal engineers,
partners, first-party apps, `developers.banzami.com`

> This is the **canonical reference** for integrating an application with the
> Banzami operator. It supersedes ad-hoc knowledge: nothing here is implicit.
> Every responsibility is separated. The worked example throughout is **DOA**
> (`~/doa`) — the reference integration.

Related engines (each has its own document): [business-resolution-engine.md](business-resolution-engine.md) (the merchant session's own view) ·
[pricing-resolution-engine.md](pricing-resolution-engine.md) ·
[settlement-resolution-engine.md](settlement-resolution-engine.md) ·
[authentication-engine.md](authentication-engine.md) ·
[integration-lifecycle.md](integration-lifecycle.md) ·
[economic-model.md](economic-model.md).
Governing decisions: [ADR-032](../adr/ADR-032-application-integration.md),
[ADR-057](../adr/ADR-057-project-financial-readiness.md) (Project financial
readiness; the operator alone prices and classifies — supersedes ADR-029).

---

## 1. Overview

An application never touches money. It creates **intent** (a payment to collect,
a campaign to fund, an order to charge) through an official SDK; the **operator**
(Banzami) resolves the financial owner, prices it, moves the money on the
double-entry ledger, and settles it. The application only reflects operator
state.

![Application integration engine](../diagrams/banzami-application-integration-v1.svg)

> Diagrams in this document predate ADR-057 (see the appendix); the text is
> authoritative.

```
Application
    │  official SDK only (never raw HTTP)
    ▼
Banzami SDK  (Flutter / TypeScript / REST)
    │  Project key (bearer) · idempotency · signatures
    ▼
API Gateway            auth · scopes · rate limiting · Project isolation
    ▼
Financial readiness    GET /v1/financial-setup → core settlement-readiness
    ▼
Pricing Engine         assigned pricing profile → rate per operation
    ▼
Settlement Engine      fee (operator-priced) → named fee destination · net → beneficiary
    ▼
Ledger                 double-entry · single source of truth
```

The protocol/operator/application split is fixed (see [ADR-025](../adr/ADR-025-platform-mode-environment-router.md)
and [protocol-integration.md](protocol-integration.md)): **BANZA** defines the
rules, **Banzami** executes them, **applications** consume them.

---

## 2. What is an integrated application?

An integrated application (DOA, a marketplace, a school, a delivery app):

**NEVER**
- moves money
- owns a wallet
- computes settlement
- chooses or computes **any** fee rate — settlement or payout
- classifies its own Business Account
- holds a ledger
- runs KYB / KYC / compliance / risk

**ONLY**
- creates requests (payment sessions, collections, split bills, settlements)
- presents information resolved by the operator
- names **who** receives an application fee (`fee_destination_banza_name`)

> **All the money belongs to the operator.** The application holds a *reference*,
> never a balance. This is enforced by [ADR-028](../adr/ADR-028-application-business-account-requirement.md)
> (an application fee lands only in a validated Business Account) and the ledger
> design in [money-engine.md](money-engine.md).

---

## 3. Responsibilities (the hard boundary)

| Concern | Application | Operator (Banzami) |
|---|---|---|
| UX / branding | ✔ owns | ✘ |
| Campaigns / catalogue / orders | ✔ owns | ✘ |
| Business logic (who to charge, when) | ✔ owns | ✘ |
| **Fee destination** (who receives the application fee) | ✔ names | ✔ validates (ADR-028) |
| **Fee rate** (settlement and payout) | ✘ | ✔ owns — assigned pricing profile |
| Business classification (`APPLICATION` / `PLATFORM`) | ✘ | ✔ owns — BANZADMIN, audited |
| Money movement | ✘ | ✔ owns |
| Wallet + sub-accounts | ✘ | ✔ owns |
| KYB / KYC / compliance / risk | ✘ | ✔ owns |
| Ledger + settlement + payout | ✘ | ✔ owns |
| Audit trail + proofs | ✘ | ✔ owns |

If a task is on the operator side, the application **cannot** perform it even if
it wanted to — the API surface does not expose it, and a settlement request that
carries a pricing field is refused (400 `PRICING_FIELD_NOT_ACCEPTED`). The
application receives *resolved facts* (see §4) and *reference ids*, never raw
financial primitives.

---

## 4. Financial readiness — `GET /v1/financial-setup`

One Project key in → the Project's own financial readiness out, in a single call.
The key is the authority: nothing in the request names a Project, owner or
account. Scope `identity:read`. SDK: `getFinancialSetup()` (`@banzami/sdk`
0.12.0). Decision: [ADR-057](../adr/ADR-057-project-financial-readiness.md).

![Business Resolution Engine](../diagrams/banzami-business-resolution-v1.svg)

> The diagram above predates ADR-057 and still shows `GET /v1/integration`; the
> text is authoritative.

```
Project key
   ↓  gateway: authenticate, check identity:read, read the Project binding
   ↓  core: POST /internal/v1/settlement-readiness
   ↓     rate         ApplicationSettlementEngine::resolve_settlement_fee
   ↓     destination  application_settlements::evaluate_fee_destination
   ↓
Project-scoped readiness (no owner / wallet / account / rule ids)
```

Readiness is computed by core with **the same functions settlement calls**, so
`settlement.ready == true` exactly when every deterministic prerequisite the
settlement path checks passes, and each blocker is the refusal code settlement
would return. The gateway projects core's answer and recomputes nothing. What
cannot be known in advance — a particular source account's balance, the
beneficiary a request will name — is checked by each settlement.

The app calls this on launch and on a short poll (e.g. every 30 s) and renders
whatever it returns — it never derives status, pricing or readiness itself.

Optional query: `fee_destination=@handle` (SDK `{ feeDestination: '@handle' }`)
evaluates that account as the fee destination instead of the Project's own
financial identity.

`GET /v1/integration` is **not** this resource: it is the merchant session's own
dashboard view ([business-resolution-engine.md](business-resolution-engine.md)).
A Project key there is refused with 403 `USE_FINANCIAL_SETUP`.

---

## 5. Pricing Resolution

The application **never chooses a fee**. The operator assigns the financial
owner a **pricing profile**; the profile's rule for the operation being executed
decides the rate.

```
Assigned pricing profile      (operator decision, audited — e.g. sandbox-default)
      ↓  fee-bearing operation (SETTLEMENT or PAYOUT) + effective window
Exactly one pricing rule
      ↓
Rate (bps) → fee, recorded in an immutable snapshot
```

Current Sandbox matrix ([economic-model.md](economic-model.md)):

| profile | SETTLEMENT | PAYOUT |
|---|---|---|
| `sandbox-default` | 0 bps (explicit) | 75 bps |
| `sandbox-reference` | 200 bps | 75 bps |

Full detail: [pricing-resolution-engine.md](pricing-resolution-engine.md),
[pricing-mapping.md](pricing-mapping.md),
[ADR-031](../adr/ADR-031-transaction-type-pricing-dimension.md).

> DOA does not pick its fee. The profile the operator assigned to its Business
> Account does. Changing DOA's rate means an operator assigning a different
> profile (or versioning the profile's rule) — never a value in the DOA app.

---

## 6. Settlement

The application requests a settlement, names the beneficiary and — when the
resolved fee is greater than zero — the **fee destination**; the operator prices
it, validates the destination, posts the ledger and pays out. Full detail:
[settlement-resolution-engine.md](settlement-resolution-engine.md),
[ADR-057](../adr/ADR-057-project-financial-readiness.md).

![Settlement flow](../diagrams/banzami-settlement-flow-v1.svg)

```
Application → Operator → Ledger → Settlement → Bank/rails → Beneficiário
```

Funds received into a segregated sub-account (e.g. a campaign account,
[ADR-027](../adr/ADR-027-wallet-accounts-operator-implementation.md)) are **held**
until close, then settle to the beneficiary. Terminal state is driven by the
operator via `application_settlement.completed | failed | cancelled` webhooks.

---

## 7. Application fee: who prices, who receives

A settlement carries at most one fee — the **application fee** — and the two
halves of deciding it belong to different parties:

![Application fee vs operator fee](../diagrams/banzami-application-fee-v1.svg)

> The diagram above predates ADR-057 and still shows a rate chosen by the app;
> the text is authoritative.

```
100 000 Kz (gross)
   → Application fee  rate = assigned profile's SETTLEMENT rule (operator)
                      recipient = fee_destination_banza_name (application)
   → Beneficiário     net (@handle / IBAN)
```

- **The rate is the operator's.** No rate field exists in the public settlement
  contract. Reference: `sandbox-reference`, gross 100 000 → fee 2 000, net 98 000.
- **The recipient is the application's.** It names the fee destination. Core
  prices first, then:
  - resolved fee > 0 → a destination is **required** (`FEE_DESTINATION_REQUIRED`)
    and validated under ADR-028;
  - resolved fee = 0 → none is required, and a named one is not validated.
- **ADR-028.** A fee destination must be a Business Account that exists and is
  `ACTIVE`, has KYB `APPROVED`, holds an `ACTIVE` wallet containing the
  destination account, and is classified `APPLICATION` or `PLATFORM`. No
  dedicated application-purpose wallet account is required.
- **Classification is an operator decision.** Default `MERCHANT`; changed only in
  BANZADMIN with a reason, a typed confirmation and an audit entry. Nothing
  self-service classifies an account.
- **The operator's withdrawal fee** is separate: it is the profile's `PAYOUT`
  rule, charged when money leaves the network ([economic-model.md](economic-model.md)).

Neither fee is ever computed client-side, and no caller sends a rate: a request
carrying `application_fee_bps`, `fee_bps`, `rate_bps`, `pricing_profile`,
`business_category`, `fee_policy_ref`, `application_fee_minor` or `fee_minor` is
refused with 400 `PRICING_FIELD_NOT_ACCEPTED`.

> **Historical.** Until ADR-057, ADR-029 let an application send
> `application_fee_bps`; a non-zero value skipped the Pricing Engine and charged
> what the caller asked, up to 50%. That path is removed.

---

## 8. Financial readiness response

`GET /v1/financial-setup` returns:

| Field | Content |
|---|---|
| `environment` | `SANDBOX` / `LIVE` |
| `project` | `{ id, name, ref }` — the Project's own id (as in the Console), name and slug; `/v1/me` carries the same object |
| `financial_setup` | `{ state: UNCONFIGURED \| READY \| SEALED, configured, sealed }` |
| `financial_identity` | `{ handle }` — the Project's @banza |
| `kyb` | `{ status }` |
| `wallet` | `{ status, ready, currency }` |
| `pricing` | `{ profile, settlement_bps, payout_bps }` — the operator-assigned profile |
| `fee_destination` | `{ handle, required, resolved, owned_by_project, kyb_approved, wallet_active, type_allowed, application_account_ready, eligible, blocker }` |
| `settlement` | `{ ready, blockers[], warnings[] }` |

No merchant, owner, binding, wallet, account or rule id appears.

Errors: 401 invalid key · 403 `INSUFFICIENT_SCOPE` · 409
`FINANCIAL_SETUP_CONFLICT` (the binding names an owner core cannot evaluate) ·
503 `SERVICE_UNAVAILABLE` (an outage, never reported as missing configuration).
A Project with no financial owner is **200** with `state: UNCONFIGURED` and the
blocker `FINANCIAL_SETUP_NOT_CONFIGURED` — a state, not an error.

Sub-accounts are listed via `GET /v1/wallet-accounts`.

---

## 9. Blockers

Each blocker is the refusal code a settlement would return. The app renders
them; it never invents or clears them. Empty `settlement.blockers[]` ⇒ the
Project can settle (subject to the per-request checks in §4).

| Blocker | Meaning | How it is resolved |
|---|---|---|
| `FINANCIAL_SETUP_NOT_CONFIGURED` | The Project has no financial owner | The owner configures Financial Setup in the Console |
| `WALLET_MISSING` | No `ACTIVE` wallet with an account to settle from | Operator provisions it |
| `PRICING_NOT_CONFIGURED` | No pricing rule applies — no profile assigned | Operator assigns a profile |
| `PRICING_CONFIGURATION_ERROR` | More than one rule applies | Operator removes the overlap |
| `FEE_DESTINATION_NOT_FOUND` | The fee destination does not resolve | Name an existing @banza |
| `FEE_DESTINATION_NOT_OWNED` | The destination is not the Project's own | Name an account the Project owns |
| `FEE_DESTINATION_NOT_BUSINESS_ACCOUNT` | Not a Banzami Business Account | Name a Business Account |
| `FEE_DESTINATION_NOT_ACTIVE` | Destination Business not `ACTIVE` | Operator / onboarding |
| `FEE_DESTINATION_KYB_NOT_APPROVED` | Destination KYB not `APPROVED` | Submit / await KYB ([kyb-merchant-verification.md](kyb-merchant-verification.md)) |
| `FEE_DESTINATION_WALLET_UNAVAILABLE` | No `ACTIVE` wallet holds the destination account | Operator provisions / reactivates it |
| `FEE_DESTINATION_TYPE_NOT_ALLOWED` | Destination not classified `APPLICATION` / `PLATFORM` | Only an operator can classify (BANZADMIN) |

`FEE_DESTINATION_*` codes block only when the resolved settlement fee is greater
than zero; on a zero-rate profile the destination is reported and blocks nothing.
Warning (never blocks): `WEBHOOK_ENDPOINT_MISSING`.

---

## 10. Complete flow

![Integration lifecycle](../diagrams/banzami-integration-lifecycle-v1.svg)

```
Create Project + Financial Setup → KYB → Wallet(+accounts) → Pricing profile
      → Application → Receber pagamento → Settlement → Beneficiário
```

Every step is gated by financial readiness (§4). Detail per stage:
[integration-lifecycle.md](integration-lifecycle.md).

---

## 11. Security

- **API Key**: server-side secret keys only (never in frontend/mobile client
  code); publishable keys for clients. Exchanged for a short-lived JWT by the SDK.
- **Scopes**: a Project key carries scopes (`identity:read` for `/v1/me` and
  `/v1/financial-setup`); its financial owner comes from the Project binding
  ([ADR-047](../adr/ADR-047-project-merchant-binding-for-developer-payment-capabilities.md)),
  never from the request. The gateway enforces isolation (a key can only touch
  its own wallet/accounts).
- **Economic authority**: no public surface accepts a rate, fee, profile or
  category (`PRICING_FIELD_NOT_ACCEPTED`); classification is an audited operator
  action.
- **Rate limiting** + **idempotency** on every mutating call (idempotency key).
- **Replay protection** on webhooks via the `banza-signature` header
  (`BANZA_WEBHOOK_SECRET`) — verify with the SDK, never by hand.
- **Structured logs + immutable audit trail** on the operator side.

See [security/](../security/) and [authentication-engine.md](authentication-engine.md).

---

## 12. Environments

| Environment | Host | Keys | Money |
|---|---|---|---|
| **Sandbox** | `sandbox-api.banzami.com` | `bz_test_*` | test only — no real value |
| **Live** | `api.banzami.com` | `bz_live_*` | real |

Never mix. A sandbox key against a live host (or vice-versa) is rejected. The
platform-mode env router is [ADR-025](../adr/ADR-025-platform-mode-environment-router.md).
(“Preview” is an operator-internal staging concept, not an app-facing environment.)

---

## 13. Errors

Standard error hierarchy (structured `{ code, message, request_id }`):

| Code | Motivo | Como resolver |
|---|---|---|
| `UNAUTHORIZED` | Missing/invalid API key or JWT | Re-authenticate via the SDK |
| `FORBIDDEN` | Key not owner of the target resource | Use the correct Project's key |
| `INSUFFICIENT_SCOPE` | Key lacks the scope (e.g. `identity:read`) | Issue a key with the scope |
| `USE_FINANCIAL_SETUP` | A Project key called `GET /v1/integration` | Use `GET /v1/financial-setup` (`getFinancialSetup()`) |
| `FINANCIAL_SETUP_CONFLICT` | The Project binding names an owner core cannot evaluate | Contact support — nothing the developer can fix |
| `PRICING_FIELD_NOT_ACCEPTED` | A settlement request carried a rate / profile / category field | Remove it — the rate is the operator's |
| `PRICING_NOT_CONFIGURED` | No pricing profile / rule applies | Operator assigns a profile |
| `FEE_DESTINATION_REQUIRED` | The resolved fee is > 0 and no destination was named | Send `fee_destination_banza_name` |
| `FEE_DESTINATION_*` | The named destination fails an ADR-028 condition | See §9 |
| `INVALID_AMOUNT` | Amount ≤ 0 / missing on open link | Send a positive `amount_minor` |
| `NO_WALLET` | Payer has no wallet in the currency | Payer creates a wallet first |
| `INSUFFICIENT_FUNDS` | Source / payer balance too low | Top up / wait for funds |
| `SERVICE_UNAVAILABLE` / `UPSTREAM_ERROR` | Transient operator/core error | Retry with the same idempotency key |

Every error carries `request_id` for support/audit. Never surface raw internals
to end-users; map to friendly copy.

---

## Appendix — diagrams

New (this document): `banzami-application-integration-v1.svg`,
`banzami-application-fee-v1.svg`, `banzami-business-resolution-v1.svg`,
`banzami-settlement-flow-v1.svg`, `banzami-integration-lifecycle-v1.svg`.
Reuse: `banzami-ecosystem-architecture-v1.svg`, `banzami-money-flow-v1.svg`,
`banzami-wallet-accounts-v1.svg`, `banzami-doa-example-v1.svg`.
All SVG, `SVG-BZ-*` numbered, same visual language as the README.

> **Stale diagrams (pre-ADR-057):** `banzami-business-resolution-v1.svg` and
> `banzami-integration-lifecycle-v1.svg` still show `GET /v1/integration` as the
> integration readiness surface; `banzami-application-fee-v1.svg`,
> `banzami-application-integration-v1.svg`, `banzami-settlement-flow-v1.svg` and
> `banzami-doa-example-v1.svg` still show an app-chosen fee rate (and category
> pricing). The text of this document is authoritative until they are redrawn.
