# Business Resolution — the merchant session's own view of its Business account

**Status:** Implemented · **Version:** 1.0 · **Endpoint:** `GET /v1/integration`
(merchant session only)

> **Scope (ADR-057).** `GET /v1/integration` is the **merchant session's own
> dashboard view** of its Business account. It is **not** the readiness surface
> for integrating applications. A Developer Platform Project reads its financial
> readiness from **`GET /v1/financial-setup`** with its Project key
> ([ADR-057](../adr/ADR-057-project-financial-readiness.md),
> [application-integration-engine.md §4](application-integration-engine.md#4-financial-readiness--get-v1financial-setup)).
> A Project key presented to `/v1/integration` is refused with **403
> `USE_FINANCIAL_SETUP`**. The SDK method that read this route
> (`getBusinessMe()`) was removed in `@banzami/sdk` 0.12.0; its replacement for
> Projects is `getFinancialSetup()`.

## Why the split exists

This view names the Business's own wallet and account ids. That is correct for
the Business's own session and exactly what a Project key must never learn:
behind a Project, the financial owner and its accounts are the operator's
(ADR-057 §Context). The Project-scoped resource carries no merchant, owner,
binding, wallet, account or rule id.

The two also differ in authority:

| | `GET /v1/integration` | `GET /v1/financial-setup` |
|---|---|---|
| Caller | merchant session (Business credentials) | Project key, scope `identity:read` |
| Purpose | the Business's own dashboard state | "can this Project settle, and if not, what is missing?" |
| Computed by | the gateway (its own reads of the gateway DB) | core, `POST /internal/v1/settlement-readiness`, with the same functions settlement calls |
| Identifiers | the owner's wallet / account ids | none except the Project's own `{id, name, ref}` |
| Settlement authority | informational | `settlement.ready` ⇔ settlement's deterministic prerequisites pass |

Only `/v1/financial-setup` is guaranteed to agree with settlement. The merchant
view's `blockers[]` are a dashboard summary; the refusal codes settlement returns
are the ones `/v1/financial-setup` reports.

## The surface: `GET /v1/integration`

Self-scoped: the merchant id comes from the **authenticated merchant session**,
never from a path or query. It is therefore *not* a handle-enumeration oracle.

The response contains **only non-secret fields** — never API keys, PINs, key
hashes, storage keys, balances, or another tenant's data. Opaque wallet/account
ids are the owner's own operational identifiers and are included by design,
which is why a Project key is refused here.

History: the route was first published as `GET /v1/business/me` and renamed to
`GET /v1/integration`.

### Response

```json
{
  "environment": "SANDBOX",
  "id": "3c46a9c8-…",
  "handle": "doa",
  "business_name": "Doa",
  "business_account_type": "MERCHANT",
  "status": "ACTIVE",
  "kyb_status": "APPROVED",
  "verified": true,
  "category": "Doações e causas",
  "subcategory": null,
  "wallet_ready": true,
  "settlement_ready": true,
  "pricing": {
    "profile": "sandbox-default",
    "operations": [
      { "operation": "SETTLEMENT", "rate_bps": 0,  "rule_key": "…" },
      { "operation": "PAYOUT",     "rate_bps": 75, "rule_key": "…" }
    ],
    "found": true
  },
  "wallet":    { "ready": true, "wallet_id": "ecd4…", "currency": "AOA", "status": "ACTIVE", "primary_account_id": "9481…", "application_account_id": "" },
  "settlement":{ "ready": true, "enabled": true, "blockers": [] },
  "blockers": [],
  "warnings": [],
  "checked_at": "2026-09-10T10:00:00Z"
}
```

With `?fee_destination=@handle` the response also carries a `fee_destination`
object (one field per ADR-028 condition, plus the first unmet one as `blocker`),
reported beside the account's readiness and never merged into it.

The flat `category` / `wallet_ready` / `settlement_ready` fields are kept for
back-compat; the nested objects are the richer view.

### Fields

- **Identity** — `handle` (@banza, the public identifier), `business_name`,
  `business_account_type` (operator classification; default `MERCHANT`),
  `status`.
- **KYB** — `kyb_status` (+ `verified` = APPROVED).
- **Category** — `category` is the merchant's descriptive label. It selects no
  rate.
- **Pricing** — `pricing.profile` is the pricing profile an **operator assigned**
  to the account; `pricing.operations[]` is what that profile charges per
  fee-bearing operation (settlement and payout, see
  [economic-model.md](economic-model.md)). `found: false` means no priced policy
  is assigned.
- **Wallet** — `wallet` (id, currency, status) + `primary_account_id` and, if one
  exists, `application_account_id`. No application-purpose account is required
  to receive an application fee (ADR-057 §4).
- **Settlement** — `settlement_ready` is derived from the **absence of
  blockers**. `warnings[]` is advisory and never blocks.

### Blocker reason codes (merchant view)

`settlement_ready == (blockers is empty)`.

| Code | Meaning |
|------|---------|
| `BUSINESS_NOT_ACTIVE` | merchant status ≠ ACTIVE |
| `KYB_NOT_APPROVED` | compliance KYB not APPROVED |
| `WALLET_MISSING` | no wallet linked |
| `WALLET_ACCOUNT_MISSING` | wallet exists but no PRIMARY account |
| `PRICING_MISSING` | no priced policy assigned — the resolver refuses rather than charging zero |

Warning: `WEBHOOK_ENDPOINT_MISSING` (no active webhook endpoint; the app would
rely on polling).

## Who decides what

| Concern | Owner | Source |
|---------|-------|--------|
| Settlement fee **rate** | **Operator** | the assigned pricing profile (ADR-057 §3) |
| Fee **destination** (who receives it) | the integrating application | `fee_destination_banza_name` on the settlement request |
| Business classification (`APPLICATION` / `PLATFORM` / `MERCHANT`) | **Operator** | BANZADMIN, reason + typed confirmation + audit (ADR-057 §4) |
| KYB, wallet, readiness | **Operator** | this view (merchant session) or `/v1/financial-setup` (Project) |

No caller sends a rate. A settlement request carrying `application_fee_bps` or
any other pricing field is refused with 400 `PRICING_FIELD_NOT_ACCEPTED`.

## Observability

Structured logs, no secrets: `business_resolution_started`,
`business_resolution_success`, `business_resolution_blocked`,
`business_resolution_failed`.

## Historical (superseded)

- **Integrating apps read this route.** Until ADR-057, this route was documented
  as the readiness surface for every integrating application ("any operator app
  resolves its own account the same way"). DOA's
  `getBanzamiIntegrationStatus()` called `getBusinessMe()`, mapped `blockers[]`
  to Portuguese copy and merged in DOA's own fee from `doa_settings`. That path
  is gone: a Project key now gets 403 `USE_FINANCIAL_SETUP`, `getBusinessMe()` is
  removed from the SDK, and DOA no longer owns a fee rate. An integrating
  application uses `getFinancialSetup()`.
- **Category pricing.** The response used to carry `pricing_category` and a single
  `pricing.fee_bps` derived from the category label. Nothing is priced by
  category any more; both fields were removed in favour of `profile` +
  `operations[]`.
- **"ADR-029 settlement does not require APPLICATION/PLATFORM."** That was true of
  the removed app-defined path. Under ADR-057 a fee destination must be
  `APPLICATION` or `PLATFORM` whenever the resolved fee is greater than zero; on
  a zero-rate profile no destination is required.

## Known limitations

- **`subcategory`** is captured at onboarding but not modelled further.
- The merchant view is gateway-computed. It reports `KYB_NOT_APPROVED` and
  `BUSINESS_NOT_ACTIVE` about the account itself, which the Project readiness
  resource reports as facts (`kyb.status`) rather than blockers; for "will a
  settlement be accepted", `/v1/financial-setup` is the authority.
