# Business Resolution — how an app resolves its Banzami Business account

**Status:** Implemented · **Version:** 1.0 · **Endpoint:** `GET /v1/business/me`

An application built on Banzami (DOA today; Mongo and others later) must not
guess its own operator state from local env vars. The operator is the source of
truth for the Business account. This document describes the resolution surface
the operator exposes and how an app consumes it.

## Why it exists

Before this, an integrating app inferred KYB, wallet, category, pricing and
settlement readiness from scattered env vars — which drift, go stale, and can't
express *why* something isn't ready. The symptom: a DOA Admin showing "—" for
every operator-owned field while the account was perfectly healthy on Banzami
(and, in one case, a stale API key that silently failed auth so *nothing*
resolved).

The rule (BANZA ADR-029/035): **the operator owns Business-account state; the
app owns only its own policy** (e.g. DOA's application fee). So the app asks the
operator "who am I?" and merges its local policy on top.

## The surface: `GET /v1/business/me`

Self-scoped: the merchant id comes from the **authenticated token**, never from
a path or query. It is therefore *not* a handle-enumeration oracle — an app can
only resolve the account its own API key authenticates as. This is the secure
form of "resolve @doa": DOA's key *is* @doa, so `me` *is* @doa.

Authentication is the standard API-key → JWT exchange (`POST /v1/auth/token`).
The response contains **only non-secret fields** — never API keys, PINs, key
hashes, storage keys, balances, or another tenant's data. Opaque wallet/account
ids are the owner's own operational identifiers and are included by design.

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
  "pricing_category": "DONATION",
  "subcategory": null,
  "wallet_ready": true,
  "settlement_ready": true,
  "pricing":   { "category": "DONATION", "profile": "", "rule_key": "donation-standard", "fee_bps": 50, "found": true },
  "wallet":    { "ready": true, "wallet_id": "ecd4…", "currency": "AOA", "status": "ACTIVE", "primary_account_id": "9481…", "application_account_id": "" },
  "settlement":{ "ready": true, "enabled": true, "blockers": [] },
  "blockers": []
}
```

The flat `category` / `wallet_ready` / `settlement_ready` fields are kept for
back-compat; the nested `pricing` / `wallet` / `settlement` objects are the
richer resolution.

### Fields

- **Identity** — `handle` (@banza, the public identifier), `business_name`,
  `business_account_type`, `status`.
- **KYB** — `kyb_status` (+ `verified` = APPROVED). Assembled from
  `merchant_compliance`.
- **Category / pricing** — `category` (label) → derived `pricing_category`
  (DONATION, …). `pricing` reflects the **operator's own** fee rule for that
  category (informational); it is *not* the app's application fee.
- **Wallet** — `wallet` (id, currency, status) + the segregated accounts under
  it (`primary_account_id`, and `application_account_id` if one exists).
- **Settlement** — `settlement_ready` is derived from the **absence of
  blockers**. `blockers[]` carries machine-readable reason codes.

### Blocker reason codes

Stable strings; apps map them to their own copy. `settlement_ready == (blockers is empty)`.

| Code | Meaning |
|------|---------|
| `BUSINESS_NOT_ACTIVE` | merchant status ≠ ACTIVE |
| `KYB_NOT_APPROVED` | compliance KYB not APPROVED |
| `WALLET_MISSING` | no wallet linked |
| `WALLET_ACCOUNT_MISSING` | wallet exists but no PRIMARY account |
| `PRICING_MISSING` | a pricing category is known but no operator rule matches |

## Local vs operator data (the DOA example)

| Concern | Owner | Source |
|---------|-------|--------|
| Application fee (2% / 200 bps) | **DOA** | `doa_settings` (DOA DB) |
| Fee destination (@doa) | **DOA** | `doa_settings` |
| KYB, wallet, category, settlement readiness | **Operator** | `GET /v1/business/me` |
| Operator's own category fee (0.5%) | **Operator** | `pricing_rules` |

DOA's `getBanzamiIntegrationStatus()` calls `getBusinessMe()`, maps `blockers[]`
to human messages, and merges its own fee — then renders the "Integração
Banzami" card in Definições + Financeiro (manual refresh + 30s poll).

## Observability

Structured logs, no secrets: `business_resolution_started`,
`business_resolution_success`, `business_resolution_blocked`,
`business_resolution_failed` (operator); `banzami_integration_status_requested`,
`banzami_integration_status_success`, `banzami_integration_status_failed` (DOA).

## Future use

Any operator app (Mongo, taxi apps, …) resolves its own account the same way:
authenticate with its Business API key, call `GET /v1/business/me`, render its
integration health, and gate its flows on `settlement_ready` / `blockers[]`.

## Known limitations

- **`subcategory`** is not modelled in the operator yet (always `null`).
- **`business_account_type`** is the stored value (e.g. MERCHANT). ADR-029
  settlement does not require APPLICATION/PLATFORM, so a MERCHANT donation app
  settles correctly; promoting the type is a separate operator data change.
- **Pricing** is resolved by `business_category`, not per-merchant overrides.
