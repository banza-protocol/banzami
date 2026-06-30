# Business Accounts — the rule for monetised apps

**ADR:** ADR-028 · **Version:** 1.0

> **An application that moves or receives money through Banzami = a validated
> Business Account in Banzami.**

This is an operator rule (Banzami), not a BANZA protocol concept.

## Layering

```
Client application  (DOA, Mongo, marketplace, delivery, NGO, ticketing, …)
        │   consumes operator APIs / SDKs only
        ▼
Business Account in Banzami   — own @banza, wallet(s), KYB-approved,
        │                        own API keys, fee destination, own webhooks
        ▼
Banzami operator              — the only layer that writes the ledger / moves money
        ▼
BANZA protocol
```

An app **never** talks to BANZA directly, **never** writes the ledger, **never**
moves money directly. It only consumes Banzami operator APIs/SDKs.

## What every monetised app has

| Thing | Where |
|-------|-------|
| `@banza` handle | merchant handle |
| Business Account | `merchants` row |
| Wallet(s) | `wallets` (+ segregated accounts, ADR-027) |
| KYB approved | `merchant_compliance.kyb_status = APPROVED` |
| Own API keys | `api_keys` (never the operator's credentials) |
| Fee destination | a wallet of the app's own Business Account |
| Own webhooks | the app's webhook endpoints |
| Account type | `merchants.business_account_type` (ADR-028) |

## Operator taxonomy (`business_account_type`)

`MERCHANT` (default) · `APPLICATION` · `PLATFORM` · `NGO` · `MARKETPLACE` ·
`DELIVERY` · `OTHER`. Operator-only; never a protocol field.

- Declared at onboarding → confirmed at KYB → copied to the merchant on approval.
- Re-tagged by the operator: `PATCH /admin/v1/merchants/{id}/business-account-type`.
- Shown in BANZADMIN (merchant detail + list).

## Enforcement (the teeth)

An **application fee** may only be paid to a validated Business Account: the fee
destination must resolve to a merchant that is **KYB-approved**, **active**, and of
a **permitted type** (`APPLICATION`/`PLATFORM`). Enforced fail-closed in the
Application Settlement create path (`guard_application_fee_destination`). An app
cannot take a cut of value it routes unless it is a properly set-up Business
Account.

See: [ADR-028](../adr/ADR-028-application-business-account-requirement.md),
[Application Settlement domain](../domains/application-settlement/README.md),
[DOA readiness](../doa/readiness.md).
