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
| Pay the campaign out (2% app fee + net to beneficiary) | settle FROM the account | `source_wallet_account_id` on `POST /v1/application-settlements` |
| Know when a settlement finished | webhook | `application_settlement.completed` / `.failed` / `.cancelled` |
| Operator can see campaign balances | read-only admin | `GET /admin/v1/wallets/{id}/accounts` |

## Lifecycle (per campaign)

```
1. activate campaign  → POST /v1/business/wallet-accounts
                         {wallet_id, purpose:"CAMPAIGN", reference_type:"DOA_CAMPAIGN",
                          reference_id:<campaign_id>}        (idempotent)
2. collect donations  → dynamic QR / link bound to the campaign account
                         → each donation credits ONLY that account
3. close campaign     → POST /v1/business/application-settlements
                         {source_account_id:<campaign account>, beneficiary_banza_name:"@ngo",
                          fee_destination_banza_name:"@doa", application_fee_bps:500,
                          reference_type:"DOA_CAMPAIGN", reference_id:<campaign_id>,
                          idempotency_key:<...>}
                         → 2% to @doa, net to the beneficiary, only the campaign account debited
4. mark SETTLED       → on application_settlement.completed webhook
```

## Hard rules DOA must follow

- **SDK-first.** Integrate via the official Banzami SDK — no hand-rolled HTTP.
- **No sub-balances in DOA.** Balances live in Banzami; DOA reads them, never
  computes them.
- **No amounts on settlement.** The gross is the campaign account's balance, read
  by the operator. DOA never sends an amount. DOA defines its own fee rate
  (`application_fee_bps`, e.g. 200 = 2%, ADR-029); the operator computes the fee
  from the real balance and **never** uses an operator `pricing_rule` for it.
- **DOA never sees ledger account ids.** It references `wallet_id` /
  `wallet_account_id` only.

## @doa must be a validated Business Account (ADR-028)

DOA is a monetised application, so it MUST exist as a Banzami Business Account:

- `@doa` Business Account with `business_account_type = APPLICATION` (operator tags
  it via `PATCH /admin/v1/merchants/{id}/business-account-type`, or it is declared
  at onboarding and copied on KYB approval).
- **KYB approved** and an **active wallet** — this is the fee destination.

The Application Settlement guard is fail-closed: if the 2% fee destination is not a
KYB-approved `APPLICATION`/`PLATFORM` Business Account, the settlement is **rejected**
(`FEE_DESTINATION_*` errors). So DOA cannot take a fee until `@doa` is properly set up.

## The fee is DOA's, executed by the operator (ADR-029)

DOA's 5% is **app-defined**: DOA sends `application_fee_bps = 500` to
`POST /v1/business/application-settlements`; the operator computes the fee from the
campaign account's real balance and bypasses operator `pricing_rules` entirely. No
`doa-5pct` pricing policy is needed (or wanted) in the operator. See the full
[settlement contract](settlement-contract.md).

## Operator follow-ups before DOA go-live

- [ ] Tag `@doa` as `APPLICATION` and ensure its KYB is APPROVED (ADR-028 guard).
- [ ] DOA migrates its donation flow onto the campaign-account model and removes
      any local financial-logic that duplicates the operator.
- [ ] DOA sends its own `application_fee_bps` per campaign (ADR-029) — no operator
      pricing rule for the DOA fee.
- [ ] Sandbox E2E sign-off (create A+B, donate into each, isolation, settle A).
