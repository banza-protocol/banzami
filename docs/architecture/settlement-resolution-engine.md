# Settlement Resolution Engine — how the operator settles to a beneficiary

**Status:** Implemented · **Version:** 1.0 · **Part of:**
[application-integration-engine.md](application-integration-engine.md) ·
**Decisions:** [ADR-029](../adr/ADR-029-application-defined-settlement-fees.md),
[ADR-027](../adr/ADR-027-wallet-accounts-operator-implementation.md)

## The flow

![Settlement flow](../diagrams/banzami-settlement-flow-v1.svg)

```
Application → Operator → Ledger → Settlement → Bank/rails → Beneficiário
```

1. The application **requests** a settlement for a source (sub-)account and
   supplies: the **beneficiary** (`@handle` or bank/IBAN) and its own
   **`application_fee_bps`**.
2. The operator **validates** the beneficiary and readiness, then **computes**
   the operator fee and the application-fee split (ADR-029).
3. The operator **posts** immutable ledger entries and orchestrates the payout
   over the bank rails.
4. Terminal state is driven by the operator via webhooks:
   `application_settlement.completed | failed | cancelled`.

## Segregated funds are held until close

Money received into a **non-PRIMARY sub-account** (e.g. a campaign account,
[ADR-027](../adr/ADR-027-wallet-accounts-operator-implementation.md)) is **held** —
it is real and in the merchant's wallet but is not spendable available balance
(surfaced as `held_minor` / "Retido em campanhas"). At campaign/close time it
settles to the beneficiary. The application sees readiness + held totals via
Business Resolution; it never moves or nets these funds itself.

## Who computes what

| Item | Owner |
|---|---|
| Gross amount | operator (from the ledger) |
| Operator fee | operator (pricing rule) |
| Application fee | app defines the **bps**; operator **executes** the split |
| Net to beneficiary | operator |
| Ledger postings | operator |
| Payout over rails | operator |
| Terminal status | operator (webhooks) |

## Application responsibilities (all it may do)

- Trigger the settlement request via the SDK.
- Provide `application_fee_bps` and the beneficiary reference.
- Reflect the operator's settlement status/amounts (never recompute them).
- Reconcile from operator events/reports — not from any local money math.

See the DOA reference: [~/doa/docs/integration/banzami-integration.md] and
[~/doa/docs/banzami-settlement-integration.md].
