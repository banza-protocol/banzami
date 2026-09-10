# ADR-057 — A Project reads its own financial readiness, and the operator alone prices and classifies

Version: 1.0
Status: Accepted
Date: 2026-09-10
Supersedes: ADR-029 (application-defined settlement fees)
Clarifies: ADR-028 (application Business Account requirement)

## Context

An integrating application asks one question before it offers a settlement:
*can my Project settle, and if not, what is missing?* Three things made that
question unanswerable for an ordinary Developer Platform Project:

1. **Two copies of the rules.** Readiness was computed in the Go gateway by its
   own SQL, with a blocker list that never looked at the fee destination.
   Settlement, in core, refused with `FEE_DESTINATION_TYPE_NOT_ALLOWED` while the
   readiness view said READY. Neither could be trusted without the other.
2. **The wrong resource.** The only readiness view (`GET /v1/integration`) was
   the Business's own dashboard state. It named the owner's wallet and account
   ids — fine for the Business's session, and exactly what a Project key must
   never learn, because behind a Project the financial owner is the operator's.
3. **A caller-chosen price.** ADR-029 let an application send
   `application_fee_bps`; a non-zero value made core skip pricing and charge
   what the caller asked, up to 50%. A caller cannot set the price of the
   service it is buying.

A fourth problem was a workaround for the first: to stop an ordinary Project on
a zero-rate profile being refused for naming its own account as fee
destination, the Sandbox readiness path classified every developer-project
Business as `APPLICATION` — granting every developer the privilege ADR-028
reserves.

## Decision

### 1. One readiness resource, Project-scoped

`GET /v1/financial-setup`. The Project key is the authority; nothing in the
request names a Project, owner or account. Scope `identity:read` (the Project
describing itself, as `/v1/me` does). The response:

```
environment
project            { id, name, ref }
financial_setup    { state: UNCONFIGURED | READY | SEALED, configured, sealed }
financial_identity { handle }
kyb                { status }
wallet             { status, ready, currency }
pricing            { profile, settlement_bps, payout_bps }
fee_destination    { handle, required, resolved, owned_by_project, kyb_approved,
                     wallet_active, type_allowed, application_account_ready,
                     eligible, blocker }
settlement         { ready, blockers[], warnings[] }
```

No merchant, owner, binding, wallet, account or rule id appears. The Project's
own id does: it is the developer's, shown in their Console, and stable across
renames. `/v1/me` carries the same `project {id, name, ref}` object.

Errors: 401 invalid key · 403 `INSUFFICIENT_SCOPE` · 409
`FINANCIAL_SETUP_CONFLICT` (the binding names an owner core cannot evaluate) ·
503 `SERVICE_UNAVAILABLE` (never reported as missing configuration). A Project
with no financial owner is **200** with `state: UNCONFIGURED` and the blocker
`FINANCIAL_SETUP_NOT_CONFIGURED` — a state, not an error.

`/v1/integration` stays the merchant session's own view; a Project key there is
refused with 403 `USE_FINANCIAL_SETUP`.

### 2. Readiness is computed by the code that settles

Core serves `POST /internal/v1/settlement-readiness`. Every rule in it is the
one settlement enforces:

| Question | Answered by |
|---|---|
| the rate | `ApplicationSettlementEngine::resolve_settlement_fee` |
| the destination | `application_settlements::evaluate_fee_destination` |

`settlement.ready == true` ⇔ every deterministic prerequisite the settlement
path checks passes. Each blocker is the refusal code settlement returns. What
cannot be known in advance — a particular source account's balance, the
beneficiary a request will name — belongs to each settlement. The invariant is
held by `core/api/src/routes/settlement_readiness_tests.rs`, which runs
readiness and a real settlement create on the same fixtures and asserts they
agree. The gateway and the Console project core's answer and recompute nothing.

### 3. The operator prices; the caller names only who receives

The rate comes from the pricing profile the operator assigned. There is no rate
field anywhere in the public settlement contract, and a request carrying any
caller pricing field (`application_fee_bps`, `fee_bps`, `rate_bps`,
`pricing_profile`, `business_category`, `fee_policy_ref`,
`application_fee_minor`, `fee_minor`) is refused with 400
`PRICING_FIELD_NOT_ACCEPTED`. ADR-029's app-defined path is removed.

The caller still names the fee destination (`fee_destination_banza_name`),
because *who* receives an application fee is the application's to say. Core
prices first, then:

- resolved fee > 0 → a destination is required (`FEE_DESTINATION_REQUIRED`) and
  validated under ADR-028;
- resolved fee = 0 → none is required, and a named one is not validated.

Every settlement stores an immutable snapshot: profile, applied bps, gross,
fee, net. Reference: `sandbox-reference`, gross 100 000 → fee 2 000, net 98 000.

### 4. ADR-028, stated once

An application-fee destination must be a Business Account that:

1. exists, and is `ACTIVE`;
2. has KYB `APPROVED`;
3. holds an `ACTIVE` wallet containing the destination account;
4. is classified `APPLICATION` or `PLATFORM`.

No dedicated application-purpose wallet account is required: the fee is
credited to the destination's own account. Readiness says so explicitly
(`application_account_ready` = the account can receive).

**What `application_fee_account_id` is.** The ledger account the fee is
credited to: the *available* account of the destination Business's ACTIVE wallet
in the settlement currency. The caller never supplies it; the gateway resolves it
from `fee_destination_banza_name` (and refuses a @banza the caller does not own)
and passes it to core. Nobody creates it for the purpose — it is created with the
Business's wallet, by wallet provisioning (for a Developer Project, by Console
Financial Setup). There is no application-purpose wallet account, and ADR-028
does not require one.

**Classification is an operator decision.** The default is `MERCHANT`. It
changes only through the operator path — `PATCH
/admin/v1/merchants/{id}/business-account-type` behind BANZADMIN, with a reason,
a typed confirmation equal to the new type, the previous value read first, and
an entry in both the admin audit log and the system audit log
(`BUSINESS_ACCOUNT_TYPE_CHANGED`). No request from a developer, a Project key,
the Console or the self-service provisioner can classify an account, and no code
path names a particular application. Migration 0115 reverts the automated
promotions (Sandbox only, audited, idempotent), leaving every operator decision
untouched.

An application may be special as an application — an operator may classify it
and assign it a priced profile. It is never special as a tenant: the same
rules, the same routes, the same readiness.

## Consequences

- An ordinary Project on `sandbox-default` (0 bps settlement) is settlement-ready
  without any classification; its fee destination is reported and blocks
  nothing.
- A Project on a priced profile whose account is not classified reads
  `FEE_DESTINATION_TYPE_NOT_ALLOWED` in readiness — the refusal settlement would
  return — until an operator classifies it.
- A Project key never receives `merchant_id` on any resource (payment
  sessions, payment links, refunds, webhook endpoints and events): one
  middleware on the dual-credential group removes owner identifiers from JSON
  responses to a Project-key principal, asserted on every mounted route.
- SDK 0.12.0: `getFinancialSetup()`, `me().project` is an object,
  `getBusinessMe()` removed. Breaking for readers of `me().project` as a string.
- The readiness contract is duplicated as a projection in the gateway and
  developer-api (separate Go modules). Both are thin, field-for-field, and
  tested for the absence of identifiers.

## Alternatives rejected

- **Keep readiness in the gateway and add the fee-destination rule there.** A
  third copy of the rule, and the next rule change would diverge again.
- **Keep auto-classifying developer Businesses as APPLICATION.** Removes the
  symptom by granting the privilege the rule exists to reserve.
- **Accept and ignore caller pricing fields.** A field that is accepted is a
  field something can start honouring again; refusing makes the contract
  visible.
- **A Project id in the path (`/v1/projects/{id}/financial-setup`).** The key
  already identifies the Project; a path id is one more thing to validate and
  one more way to ask about someone else's.
