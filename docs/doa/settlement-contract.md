# DOA ↔ Banzami settlement contract (operator-priced fee)

**ADRs:** [ADR-057](../adr/ADR-057-project-financial-readiness.md) (operator-priced
fee; supersedes ADR-029) · ADR-028 (Business Account) · ADR-027 (Wallet Accounts) ·
ADR-021 (Application Settlement) · **Version:** 1.0

> **DOA names who receives. Banzami prices and executes the money. BANZA defines
> the standards.** The settlement fee rate is the `SETTLEMENT` rule of the pricing
> profile the operator assigned — never a value DOA sends.

## One fee, two decisions

| | Rate | Recipient |
|---|---|---|
| Decided by | **Banzami** (operator) | **DOA** |
| Configured in | BANZADMIN — pricing profile assignment + pricing rules | the settlement request (`fee_destination_banza_name`) |
| Applied | at campaign close (settlement) | at campaign close (settlement) |
| Validated by | Pricing Engine (exactly one rule, else refused) | ADR-028, only when the resolved fee > 0 |

Donations credit the campaign account **gross**; only settlement and payout are
fee-bearing ([economic-model.md](../architecture/economic-model.md)).

## DOA campaign model (the app's own data — DOA implements this)

| Field | Meaning |
|-------|---------|
| `fee_destination_banza_name` | where the fee goes (`@doa`) |
| `beneficiary_banza_name` | who receives the net (`@maria`) |
| `settlement_policy_version` | which DOA policy version applied |
| `created_by` / `approved_by` | audit of who set/approved the policy |
| `effective_at` | when the policy takes effect |

This model lives in **DOA**, not Banzami. A DOA-side fee percentage, if DOA keeps
one for display, is at most an **estimate**: it cannot reach a settlement.

## Before settling: readiness

DOA reads `GET /v1/financial-setup` (`getFinancialSetup({ feeDestination: '@doa' })`)
with its Project key. `settlement.ready` is computed by core with the same
functions settlement calls; each blocker is the refusal settlement would return
([ADR-057](../adr/ADR-057-project-financial-readiness.md) §1–2).

## The request (DOA → Banzami)

```
POST /v1/application-settlements        (Project key, scope application_settlements:write; SDK-first)
{
  "source_account_id":          "<campaign wallet_account id>",
  "beneficiary_banza_name":     "@maria",
  "fee_destination_banza_name": "@doa",
  "reason":                     "CAMPAIGN_CLOSE",
  "reference_type":             "DOA_CAMPAIGN",
  "reference_id":               "campaign_123",
  "idempotency_key":            "doa-campaign-123-settle"
}
→ { settlement_id, status, gross, application_fee, net, currency,
    source_account, fee_destination, beneficiary, created_at }
```

DOA sends **no amount** — Banzami reads the campaign account's real balance — and
**no rate**. A request carrying `application_fee_bps`, `fee_bps`, `rate_bps`,
`pricing_profile`, `business_category`, `fee_policy_ref`, `application_fee_minor`
or `fee_minor` is refused with 400 `PRICING_FIELD_NOT_ACCEPTED`.

## What Banzami validates

1. the caller is authenticated — a Project key bound to a financial owner
   (otherwise 403 `PAYMENTS_UNAVAILABLE`), or a merchant session;
2. the rate: the owner's assigned profile has exactly one `SETTLEMENT` rule
   (`PRICING_NOT_CONFIGURED` / `PRICING_CONFIGURATION_ERROR` otherwise);
3. if the resolved fee > 0: a fee destination is named (`FEE_DESTINATION_REQUIRED`)
   and it is DOA's **own** Business Account, `ACTIVE`, KYB `APPROVED`, holding an
   `ACTIVE` wallet with the destination account, classified `APPLICATION` /
   `PLATFORM` (ADR-028 — `FEE_DESTINATION_*` codes). If the fee is 0, the
   destination is not validated;
4. `beneficiary` @banza exists and has an active wallet in the currency;
5. `source_account` belongs to the caller and is **segregated** (not PRIMARY) —
   DOA uses `CAMPAIGN`;
6. gross = the account's **real ledger balance**;
7. settlement idempotent; ledger posting balanced; pricing snapshot (profile,
   applied bps, gross, fee, net) stored immutably.

**DOA does NOT decide** the rate. **Banzami does NOT decide** whether a campaign
exists, who the beneficiary is, or where DOA's fee goes. Classifying `@doa` as
`APPLICATION` is an operator action in BANZADMIN (reason + typed confirmation +
audit), never self-service.

## DOA Admin (the requirements)

DOA Admin must let an operator: choose the beneficiary @banza; validate a campaign
before activation (readiness from `getFinancialSetup()`); close a campaign; request
settlement. It should show: net raised in the campaign account, the rate the
operator assigned (`pricing.settlement_bps`), estimated fee and beneficiary amount
— with the notice that **final values are computed by Banzami at settlement time**.

## Security (binding)

- DOA never computes the final balance as truth, never writes the ledger, never
  moves money, never sends or alters a fee rate, never accesses another merchant's
  wallet.
- A duplicate settlement is blocked by idempotency; a caller-chosen price is
  blocked by `PRICING_FIELD_NOT_ACCEPTED`; completion is confirmed by a signed
  `application_settlement.completed` webhook.

## Lifecycle

```
1. Operator assigns @doa's owner a pricing profile; if its settlement fee > 0,
   classifies @doa APPLICATION (audited) — KYB APPROVED, wallet ACTIVE
2. activate campaign  → create CAMPAIGN wallet_account
3. donations          → credit ONLY the campaign account, gross (ADR-042 routing)
4. readiness          → GET /v1/financial-setup  (settlement.ready)
5. close campaign     → POST /v1/application-settlements (no rate)
6. Banzami            → fee (profile rate) → @doa, net → beneficiary, balanced posting, audited
7. webhook            → application_settlement.completed
8. DOA                → mark campaign SETTLED
9. BANZADMIN          → shows the settlement
```

## Historical (superseded by ADR-057)

This contract was first written as **"app-defined fee"** (ADR-029): DOA kept a
`campaign_fee_bps` in its own campaign policy and sent it as
`application_fee_bps` (e.g. `500`) on the settlement request; Banzami bounded it at
`0..=5000` (50%), computed the fee from the real balance and bypassed operator
`pricing_rules` entirely, stating that "Banzami does NOT decide whether the fee is
2%". ADR-057 removed that path: the rate is the operator's, and a caller pricing
field is refused.
