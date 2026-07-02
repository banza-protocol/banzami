# ADR-029 — Application-defined settlement fees

**Status:** Accepted · **Date:** 2026-06-30 · **Scope:** Operator-only · **Builds on:** ADR-021, ADR-027, ADR-028

> Version: 1.0

---

## Context

An app like DOA charges its own commercial fee (e.g. 5% of a campaign). That fee is
the **app's commercial policy**, not the operator's. Until now the only way to apply
an application fee was the operator **Pricing Engine** (`fee_policy_ref` →
`pricing_rules`), which is how the **operator** prices things — the wrong tool for an
app-owned fee. We must separate the two cleanly and forever.

## Two fees, never confused

| | **Operator Fee (Banzami)** | **Application Fee (DOA / the app)** |
|---|---|---|
| Defined by | the operator | the **app** |
| Configured in | BANZADMIN / `pricing_rules` | the app (e.g. DOA Campaign Policy) |
| Applied | on every payment/donation | at **campaign close** (settlement) |
| Visible to payer | no | no |
| Source of the rate | operator Pricing Engine | the app sends `application_fee_bps` |
| Uses `pricing_rules`? | **yes** | **never** |

## Decision

1. **The app defines its fee.** An Application Settlement may carry an explicit
   `application_fee_bps` supplied by the app. The operator computes
   `fee = floor(gross * bps / 10_000)` and `net = gross − fee`. The DOA 5% is
   `application_fee_bps = 500` — DOA policy, not Banzami policy.

2. **`pricing_rules` are NOT used for an app-defined fee.** The Pricing-Engine path
   (`fee_policy_ref`) remains for operator-priced settlements; the app-defined path
   bypasses it entirely. The two are mutually exclusive on a single settlement.

3. **The operator validates and executes — it never decides the commercial rate.**
   Banzami validates: the app is authenticated, has a Business Account, is
   KYB-approved; `fee_destination` belongs to the app (and is an APPLICATION/PLATFORM
   account per ADR-028); the beneficiary exists; the source account belongs to the
   app and has `purpose = CAMPAIGN`; the gross is the account's **real ledger
   balance** (the app never sends an amount); `application_fee_bps` is within the
   operator's safety bounds (`0 ≤ bps ≤ 5000` = 50% hard cap); the settlement is
   idempotent; and the ledger posting is balanced. Banzami does **not** decide
   whether the fee is 2%, whether a campaign charges a fee, or any campaign rule.

4. **Safety bound, not pricing.** The `0..=5000` bps cap is an anti-abuse guardrail
   (a fat-finger 100000 bps is rejected), not the operator pricing a product.

## Contract (app → operator)

```
POST /v1/business/application-settlements
{
  "source_account_id":           "<campaign wallet_account id>",
  "beneficiary_banza_name":      "@maria",
  "fee_destination_banza_name":  "@doa",          // optional ⇒ no fee
  "application_fee_bps":         500,             // app-defined; 0..=5000
  "reason":                      "CAMPAIGN_CLOSE",
  "reference_type":              "DOA_CAMPAIGN",
  "reference_id":                "campaign_123",
  "idempotency_key":             "doa-campaign-123-settle"
}
→ { settlement_id, status, gross, application_fee, net, currency,
    source_account, fee_destination, beneficiary, created_at }
```

The app sends **no amount** — the gross is read from the campaign account's real
balance. The app never sees ledger account ids.

## Consequences
- It becomes impossible to confuse the Operator Fee (Banzami, per-payment,
  `pricing_rules`) with the Application Fee (app, at settlement, `application_fee_bps`).
- DOA owns its 5%; Banzami executes and audits it; BANZA defines the standards.
- The Pricing-Engine settlement path is untouched and still available for
  operator-priced flows.

## Alternatives considered
- **Force DOA's fee through `pricing_rules`**: rejected — it makes an app's
  commercial rate look like operator pricing, violating the separation this ADR exists
  to guarantee.
- **Let the app send the fee amount directly**: rejected — the app must not compute
  money; it sends a *rate*, the operator computes the *amount* from the real balance.

## Related
ADR-021 (Application Settlement), ADR-027 (Wallet Accounts), ADR-028 (Business
Account requirement). DOA: `docs/doa/readiness.md`.
