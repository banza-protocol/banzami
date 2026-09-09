# DOA ↔ Banzami settlement contract (app-defined fee)

**ADRs:** ADR-029 (app-defined fee) · ADR-028 (Business Account) · ADR-027 (Wallet
Accounts) · ADR-021 (Application Settlement) · **Version:** 1.0

> **DOA defines the commercial rule. Banzami executes the money. BANZA defines the
> standards.** The DOA 2% is DOA's policy — never a Banzami `pricing_rule`.

## Two fees, never confused

| | Operator Fee (Banzami) | Application Fee (DOA) |
|---|---|---|
| Defined by | Banzami | **DOA** |
| Configured in | BANZADMIN / `pricing_rules` | DOA Campaign Policy |
| Applied | every donation | at campaign close (settlement) |
| Rate source | operator Pricing Engine | `application_fee_bps` sent by DOA |
| Uses `pricing_rules` | yes | **never** |

## DOA campaign model (the app's own data — DOA implements this)

A DOA campaign carries the commercial policy DOA owns:

| Field | Meaning |
|-------|---------|
| `campaign_fee_bps` | DOA's fee rate in basis points (e.g. `200` = 2%) |
| `fee_destination_banza_name` | where the fee goes (`@doa`) |
| `beneficiary_banza_name` | who receives the net (`@maria`) |
| `settlement_policy_version` | which policy version applied |
| `created_by` / `approved_by` | audit of who set/approved the policy |
| `effective_at` | when the policy takes effect |

This model lives in **DOA**, not Banzami. Banzami stores none of it — it only
receives the resolved values at settlement time.

## The request (DOA → Banzami)

```
POST /v1/application-settlements        (merchant-authenticated; SDK-first)
{
  "source_account_id":          "<campaign wallet_account id>",
  "beneficiary_banza_name":     "@maria",
  "fee_destination_banza_name": "@doa",
  "application_fee_bps":        500,
  "reason":                     "CAMPAIGN_CLOSE",
  "reference_type":             "DOA_CAMPAIGN",
  "reference_id":               "campaign_123",
  "idempotency_key":            "doa-campaign-123-settle"
}
→ { settlement_id, status, gross, application_fee, net, currency,
    source_account, fee_destination, beneficiary, created_at }
```

DOA sends **no amount** — Banzami reads the campaign account's real balance.

## What Banzami validates (and only this)

1. app authenticated; has a Business Account; KYB approved (ADR-028 guard);
2. `fee_destination` is the app's **own** business account, of type
   APPLICATION/PLATFORM, KYB-approved (ADR-028 guard);
3. `beneficiary` @banza exists and has an active wallet in the currency;
4. `source_account` belongs to the app and is **segregated** (not PRIMARY) —
   DOA uses `CAMPAIGN`;
5. gross = the account's **real ledger balance**;
6. `application_fee_bps` within the operator safety bound (`0..=5000` = 50% cap);
7. settlement idempotent; ledger posting balanced.

**Banzami does NOT decide** whether the fee is 2%, whether a campaign charges a
fee, or any campaign rule. That is DOA's.

## DOA Admin (deferred app build — the requirements)

DOA Admin must let an operator: set a default DOA fee; set a per-campaign fee (if
authorized); choose the beneficiary @banza; validate a campaign before activation;
close a campaign; request settlement. It should show: net raised in the campaign
account, estimated DOA fee, estimated beneficiary amount — with the notice that
**final values are computed by Banzami at settlement time**.

## Security (binding)

- DOA never computes the final balance as truth, never writes the ledger, never
  moves money, never alters the operator fee, never uses `pricing_rules`, never
  accesses another merchant's wallet.
- An absurd fee is blocked by the bps bound; a duplicate settlement is blocked by
  idempotency; completion is confirmed by a signed `application_settlement.completed`
  webhook.

## Lifecycle

```
1. @doa Business Account (APPLICATION, KYB-approved) exists
2. activate campaign  → create CAMPAIGN wallet_account
3. donations          → credit ONLY the campaign account (ADR-042 routing)
4. close campaign     → POST /v1/application-settlements (bps = campaign_fee_bps)
5. Banzami            → fee → @doa, net → beneficiary, balanced posting, audited
6. webhook            → application_settlement.completed
7. DOA                → mark campaign SETTLED
8. BANZADMIN          → shows the settlement
```
