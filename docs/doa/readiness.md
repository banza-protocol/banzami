# DOA readiness — campaign fund isolation via the Banzami operator

**ADRs:** Banzami ADR-027 · BANZA ADR-020 · Banzami ADR-021 (Application Settlement) ·
Banzami ADR-028 · Banzami [ADR-057](../adr/ADR-057-project-financial-readiness.md)
(Project financial readiness; the operator alone prices — supersedes ADR-029)
**Version:** 1.0

This note records what the Banzami operator provides so DOA can isolate funds
per campaign **without holding sub-balances or running any parallel financial
logic**. It is the operator-side readiness checklist.

## What DOA gets

| Need | Banzami capability | Surface |
|------|--------------------|---------|
| Know whether it can settle, and what is missing | Project financial readiness | `GET /v1/financial-setup` (`getFinancialSetup()`) |
| One isolated balance per campaign | `CAMPAIGN` wallet account | `POST /v1/wallet-accounts` |
| Donations land in the campaign balance | dynamic QR bound to the account | `wallet_account_id` on QR create |
| Pay the campaign out (operator-priced fee + net to beneficiary) | settle FROM the account | `source_account_id` on `POST /v1/application-settlements` |
| Know when a settlement finished | webhook | `application_settlement.completed` / `.failed` / `.cancelled` |
| Operator can see campaign balances | read-only admin | `GET /admin/v1/wallets/{id}/accounts` |

## Lifecycle (per campaign)

```
0. check readiness    → GET /v1/financial-setup  (settlement.ready, blockers[])
1. activate campaign  → POST /v1/wallet-accounts
                         {wallet_id, purpose:"CAMPAIGN", reference_type:"DOA_CAMPAIGN",
                          reference_id:<campaign_id>}        (idempotent)
2. collect donations  → dynamic QR / link bound to the campaign account
                         → each donation credits ONLY that account, gross
3. close campaign     → POST /v1/application-settlements
                         {source_account_id:<campaign account>, beneficiary_banza_name:"@ngo",
                          fee_destination_banza_name:"@doa",
                          reference_type:"DOA_CAMPAIGN", reference_id:<campaign_id>,
                          idempotency_key:<...>}
                         → fee at the rate of the profile the operator assigned
                           (0 on sandbox-default, 200 bps on sandbox-reference) to @doa,
                           net to the beneficiary, only the campaign account debited
4. mark SETTLED       → on application_settlement.completed webhook
```

## Hard rules DOA must follow

- **SDK-first.** Integrate via the official Banzami SDK — no hand-rolled HTTP.
- **No sub-balances in DOA.** Balances live in Banzami; DOA reads them, never
  computes them.
- **No amounts and no rates on settlement.** The gross is the campaign account's
  balance, read by the operator. The fee rate is the `SETTLEMENT` rule of the
  pricing profile the operator assigned; DOA sends no rate. A request carrying
  `application_fee_bps` (or any other pricing field) is refused with 400
  `PRICING_FIELD_NOT_ACCEPTED`.
- **Readiness from the operator.** DOA reads `GET /v1/financial-setup` with its
  Project key and renders `settlement.blockers[]`; it never derives readiness.
  `GET /v1/integration` refuses a Project key (403 `USE_FINANCIAL_SETUP`), and
  `getBusinessMe()` was removed in `@banzami/sdk` 0.12.0.
- **DOA never sees ledger account ids.** It references `wallet_id` /
  `wallet_account_id` only.

## @doa as fee destination (ADR-028, as stated in ADR-057)

DOA names `@doa` as the fee destination. Whether that is validated depends on the
rate the operator assigned:

- **Resolved fee = 0** (e.g. `sandbox-default`) — no destination is required and a
  named one is not validated; readiness reports it and it blocks nothing.
- **Resolved fee > 0** — `@doa` must be a Business Account that is `ACTIVE`, has
  KYB `APPROVED`, holds an `ACTIVE` wallet containing the destination account,
  and is classified `APPLICATION` or `PLATFORM`. No dedicated application-purpose
  wallet account is required.

Classification is an **operator decision** — default `MERCHANT`, changed only
through `PATCH /admin/v1/merchants/{id}/business-account-type` in BANZADMIN with a
reason, a typed confirmation and an audit entry (`BUSINESS_ACCOUNT_TYPE_CHANGED`).
Nothing DOA, a Project key or the Console does can classify `@doa`.

The settlement guard is fail-closed: on a priced profile, an unclassified `@doa`
reads `FEE_DESTINATION_TYPE_NOT_ALLOWED` in readiness and is refused with the same
code at settlement.

## The rate is the operator's (ADR-057)

DOA does not set its commission. The rate comes from the pricing profile the
operator assigns to DOA's financial owner; a DOA-specific rate means an operator
assigning a profile whose `SETTLEMENT` rule carries it. DOA's local fee settings
can no longer reach a settlement. See the [settlement contract](settlement-contract.md).

> **Historical (superseded).** Until ADR-057, DOA's fee was app-defined: DOA sent
> `application_fee_bps` (500 = 5% live, 200 = 2% in earlier notes) and the
> operator computed the fee from the campaign balance, bypassing operator
> `pricing_rules`. That path is removed.

## Operator follow-ups before DOA go-live

- [ ] Decide DOA's commercial rate and assign the matching pricing profile to its
      financial owner (operator decision, audited).
- [ ] If that profile's settlement fee is > 0: classify `@doa` as `APPLICATION` in
      BANZADMIN (reason + typed confirmation + audit) and ensure its KYB is
      APPROVED and its wallet ACTIVE (ADR-028).
- [ ] DOA stops sending `application_fee_bps` and moves its integration-status view
      from `getBusinessMe()` to `getFinancialSetup()` (`@banzami/sdk` 0.12.0).
- [ ] DOA migrates its donation flow onto the campaign-account model and removes
      any local financial logic that duplicates the operator.
- [ ] Sandbox E2E sign-off (create A+B, donate into each, isolation, settle A).
