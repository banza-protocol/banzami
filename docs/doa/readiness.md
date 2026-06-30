# DOA readiness — campaign fund isolation via the Banzami operator

**ADRs:** Banzami ADR-027 · BANZA ADR-042 · Banzami ADR-021 (Application Settlement)
**Version:** 1.0

This note records what the Banzami operator now provides so DOA can isolate funds
per campaign **without holding sub-balances or running any parallel financial
logic**. The DOA business UI is intentionally **not** built yet — this is the
operator-side readiness checklist.

## What DOA gets

| Need | Banzami capability | Surface |
|------|--------------------|---------|
| One isolated balance per campaign | `CAMPAIGN` wallet account | `POST /v1/business/wallet-accounts` |
| Donations land in the campaign balance | dynamic QR bound to the account | `wallet_account_id` on QR create |
| Pay the campaign out (5% app fee + net to beneficiary) | settle FROM the account | `source_wallet_account_id` on `POST /v1/application-settlements` |
| Know when a settlement finished | webhook | `application_settlement.completed` / `.failed` / `.cancelled` |
| Operator can see campaign balances | read-only admin | `GET /admin/v1/wallets/{id}/accounts` |

## Lifecycle (per campaign)

```
1. activate campaign  → POST /v1/business/wallet-accounts
                         {wallet_id, purpose:"CAMPAIGN", reference_type:"DOA_CAMPAIGN",
                          reference_id:<campaign_id>}        (idempotent)
2. collect donations  → dynamic QR / link bound to the campaign account
                         → each donation credits ONLY that account
3. close campaign     → POST /v1/application-settlements
                         {source_wallet_account_id:<account>, beneficiary_wallet_id:<ngo>,
                          application_fee_wallet_id:<doa wallet>, fee_policy_ref:"doa-5pct"}
                         → 5% to DOA, net to the beneficiary, only the campaign account debited
4. mark SETTLED       → on application_settlement.completed webhook
```

## Hard rules DOA must follow

- **SDK-first.** Integrate via the official Banzami SDK — no hand-rolled HTTP.
- **No sub-balances in DOA.** Balances live in Banzami; DOA reads them, never
  computes them.
- **No amounts on settlement.** The gross is the campaign account's balance, read
  by the operator. DOA never sends an amount; the fee is resolved by the Pricing
  Engine from `fee_policy_ref`, never a hardcoded number.
- **DOA never sees ledger account ids.** It references `wallet_id` /
  `wallet_account_id` only.

## Operator follow-ups before DOA go-live

- [ ] Create the `doa-5pct` application-fee pricing policy in the operator.
- [ ] DOA migrates its donation flow onto the campaign-account model and removes
      any local financial-logic that duplicates the operator.
- [ ] Sandbox E2E sign-off (create A+B, donate into each, isolation, settle A).
