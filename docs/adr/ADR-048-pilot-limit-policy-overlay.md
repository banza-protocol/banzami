# ADR — Pilot Limit Policy Overlay for Internal Sandbox

Version: 1.0
Status: Accepted
Date: 2026-07-08

## Context

The Phase 0 / Fase 1 internal test plan (Plano de Teste Detalhado Banzami V1.0)
defines automatic, system-enforced pilot limits for a controlled pilot. The
operator already enforces a general **KYC-tier** limit model (single/daily limits
by verification level) plus request rate limits. The specific V1.0 pilot limits
(per-payment 50.000 — raised from 25.000 on 2026-10-09, see the amendment below — consumer daily 50.000, balance caps, merchant receiving
limits, and aggregate pilot caps) are stricter than, and distinct from, that
general model, and were not previously enforced by the system.

## Decision

- The existing **KYC-tier limits remain the general profile/regulatory model** and
  are unchanged.
- A **V1.0 pilot-limit policy** is added as a **stricter overlay** applied on top of
  the KYC-tier model, in `core/compliance/src/pilot.rs`.
- The pilot limits are enforced **by the system under test** (not merely by a test
  harness), because the test plan defines them as automatic system controls.
  **Exactly which limits are wired, and where, is recorded in the enforcement
  table below — no limit is claimed as enforced without a runtime path.**
- The overlay is **config-gated** and **disabled by default**. It enables only for
  the internal Sandbox / Phase 0 profile (`BANZAMI_PILOT_LIMITS` truthy) and
  **never** activates on a live/production environment.
- Rejections use deterministic codes (`PILOT_LIMIT_*`); internal thresholds are
  never exposed in responses.
- **Merchant-credit volume is measured over ROLLING WINDOWS, not over the
  lifetime of the database** (superseded by owner decision D1, 2026-09-18; see
  the amendment below).

## Enforcement table — what the system actually does

This table is the ADR's claim of enforcement, and it is kept true by
`make check-merchant-credit-policy-coverage`, which fails if a path that can
credit a merchant neither applies the gate nor records why it does not.

| Limit | Value | Enforcement site | Wired |
|---|---:|---|---|
| Consumer per payment | Kz 50 000 | `engine.rs::authorize_operation` → `overlay_consumer_payment` | via the authorization route only |
| Consumer daily | Kz 250 000 | same | via the authorization route only |
| Consumer max balance | none (`Option<i64> = None`) | `pilot_enforce::check_funding` evaluates an optional cap; the internal Sandbox has none | n/a |
| Top-up per operation | Kz 50 000 | `pilot_enforce::check_funding` / `check_test_payer_funding` → `check_top_up_amount` | **yes** |
| Aggregate synthetic funds in circulation (Sandbox-wide safety fuse) | Kz 250 000 000 | `pilot_enforce::check_funding` (consumer funding) | **yes** |
| Merchant per receive | Kz 50 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Merchant max balance | none (`Option<i64> = None`) | `pilot_enforce::check_merchant_credit` evaluates an optional cap; the internal Sandbox has none | n/a |
| Merchant rolling 24h volume | Kz 1 000 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Merchant rolling 30d volume | Kz 30 000 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Global rolling 24h volume | Kz 2 000 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Global rolling 30d volume | Kz 60 000 000 | `pilot_enforce::check_merchant_credit` | **yes** |

`check_merchant_credit` is applied by `core/transfers/src/engine.rs` (the
wallet-native chokepoint: payment links, QR, Business Receive Point, Collection
shares), `core/api/src/routes/qr_pay.rs`, and
`core/api/src/routes/acquiring.rs` at **initiation**.

The consumer per-payment and daily rows are stated as they are: the overlay is
reachable through `POST /internal/v1/compliance/customers/{id}/authorize`, and
no payment-producing route calls it. Closing that is tracked separately; it is
recorded here rather than described as something it is not.

## Amendment — 2026-09-18 — rolling windows supersede the lifetime volume cap

**What was wrong.** The original `AGGREGATE_VOLUME_MINOR` (Kz 2 000 000) summed
every CREDIT ever posted to a merchant available account. Retiring synthetic
value posts a DEBIT, and a credits-only sum ignores debits, so the counter could
only ever rise. The Sandbox therefore had a finite total number of merchant
payments for its entire existence, with no way to recover any of them — and at
the time this was found it stood at **46,5 % consumed**, with a single heavy day
costing 15,6 %.

Worse, `check_volume` had **no caller in production code**. The cap was
documented as enforced and was not; had anyone wired it up as an obvious
tidy-up, the Sandbox would have been capped instantly at a level it had already
half-spent.

**What replaced it.** Four rolling windows, sized from the Sandbox's own
history (heaviest day ever 31 165 620; a full validation run costs 15–20 M):

```
global   24h   Kz   500 000      ≈ 1,6× the heaviest day ever observed
global   30d   Kz 4 000 000      ≈ 20 full validation runs
merchant 24h   Kz   250 000      ≈ 3,7× one run concentrated on one Business
merchant 30d   Kz 1 000 000
```

Per-merchant windows are new and they matter: with disposable merchants the
largest merchant-day was 1 100 000 and the per-merchant cap never fired, but
persistent validation actors concentrate a whole run onto three Businesses.

**No financial history was touched.** Both the old counter and the new windows
are DERIVED BY QUERY from `ledger_entries`; there is no stored counter. The
change is a predicate (`created_at >= now() - interval …`), so nothing was
deleted, rewritten or reset, and rollback is reverting the predicate. The
database independently refuses any mutation of a posted entry
(`raise_ledger_immutable`), which is asserted directly in
`the_ledger_itself_refuses_mutation`.

**Interaction, as it was and as it is.** Until 2026-10-09 `MERCHANT_MAX_BALANCE`
(Kz 100 000) was lower than `MERCHANT_ROLLING_24H` (Kz 250 000), so a merchant
that never settled hit the balance cap first. The internal Sandbox now applies
**no wallet balance cap** (see the second amendment below): only flows are
bounded, and settlement is no longer needed merely to free wallet capacity.

## Rationale

- Pilot limits are required because the test plan defines automatic system controls
  for the controlled pilot; enforcing them in a harness only would not validate the
  system.
- Keeping them a separate, gated overlay avoids weakening or entangling the general
  KYC-tier model and keeps them off for any non-pilot environment.
- **Phase 0 uses synthetic balances only.** No real money, no real customers.
- **Fase 1 with real funds remains subject to BNA approval and an approved
  safeguarding structure.** This ADR does not claim BNA approval or admission to the
  BNA Regulatory Sandbox.

## Consequences

- A new `pilot` module with unit-tested, deterministic limit evaluation.
- A gated behavioural change at the authorization point when the pilot profile is
  enabled (no change in default/live operation).
- Merchant-side enforcement is wired at the paths that credit a merchant, and
  `make check-merchant-credit-policy-coverage` fails if a new one appears
  without either the gate or a recorded reason.
- Consumer per-payment/daily enforcement on the payment path itself remains
  follow-up, and the enforcement table says so rather than implying otherwise.

## Alternatives considered

- **Harness-only enforcement** — rejected: the plan requires system-enforced
  controls.
- **Changing the KYC-tier thresholds to the pilot values** — rejected: that would
  weaken/replace the general model rather than add a controlled overlay.

## Amendment — one Sandbox per-operation maximum: Kz 50 000 (2026-10-09)

**Decision (owner).** The Sandbox maximum for a single payment is Kz 50 000,
on both sides: `CONSUMER_PER_PAYMENT_MINOR` and `MERCHANT_PER_RECEIVE_MINOR` are
both 5 000 000 and are held equal at compile time.

**Why.** A wallet could be topped up to Kz 50 000 (the consumer balance cap)
while a single payment was limited to Kz 25 000. A payer could therefore hold
more test money than any one payment would take, and a Kz 42 000 donation
through a third-party integration was refused at confirmation. The payment-link
route also answered that refusal as a 500; that mapping was fixed separately.

**What this is not.**

- It is not a cap on what a Business or a campaign accumulates. A per-payment
  limit bounds one payment's amount; the running total is bounded by the
  merchant balance cap and the rolling volume windows, which are unchanged.
- It is not a separate top-up limit. A single top-up is bounded by the consumer
  balance cap (Kz 50 000), which is the same number and is unchanged.
- It is not a regulatory limit and it does not touch LIVE: the overlay is
  inert outside the Sandbox.

**Classification.** Kz 50 000 is a *voluntary Banzami Sandbox operational
limit*: product and test policy for an environment of fictitious money. It is
not a BNA-mandated limit, not "the limit of the BNA Regulatory Sandbox", and
not a limit of any electronic-money account class. Future LIVE or regulated
limits are not derived from it. The regulatory context, and what this
repository does and does not document about the earlier Kz 25 000 value, is in
`docs/compliance/SANDBOX_OPERATIONAL_LIMITS.md`.

**Superseded the same day** by the second amendment below, which re-sizes the
daily and rolling limits and removes the wallet balance caps.

## Second amendment — transactions are limited, balances are not (2026-10-09)

**Decision (owner).** The canonical policy of the internal Banzami Sandbox:

| Parameter | Value | Constant |
|---|---:|---|
| Payment, per operation | Kz 50 000 | `CONSUMER_PER_PAYMENT_MINOR` = `MERCHANT_PER_RECEIVE_MINOR` |
| Top-up, per operation | Kz 50 000 | `TOP_UP_PER_OPERATION_MINOR` |
| Consumer payments, per day | Kz 250 000 | `CONSUMER_DAILY_MINOR` |
| Consumer wallet balance | **no cap** | `CONSUMER_MAX_BALANCE_MINOR: Option<i64> = None` |
| Business received volume, rolling 24 h | Kz 1 000 000 | `MERCHANT_ROLLING_24H_MINOR` |
| Business received volume, rolling 30 d | Kz 30 000 000 | `MERCHANT_ROLLING_30D_MINOR` |
| All Businesses, rolling 24 h | Kz 2 000 000 | `GLOBAL_ROLLING_24H_MINOR` |
| All Businesses, rolling 30 d | Kz 60 000 000 | `GLOBAL_ROLLING_30D_MINOR` |
| Business wallet balance | **no cap** | `MERCHANT_MAX_BALANCE_MINOR: Option<i64> = None` |
| Synthetic funds in circulation, whole Sandbox | Kz 250 000 000 | `AGGREGATE_FUNDS_MINOR` |

**Principle.** Wallet balance ≠ payment limit ≠ daily or 24 h volume ≠ lifetime
receipts ≠ campaign goal. A wallet may hold more than any transactional limit;
what it may *spend* or *receive* in an operation or a window is enforced
independently of what it holds. A consumer holding Kz 300 000 may pay five
times Kz 50 000 in a day and not a sixth.

**Representation.** "No cap" is `None`, not a large number: a large number is a
hidden cap. The balance checks remain and evaluate an optional ceiling, so a
future LIVE or regulated profile expresses one by supplying a value. This is not
"unlimited balance everywhere" — it is the internal Sandbox having none.

**Rolling windows.** A Business may receive Kz 1 000 000 in 24 hours; its 30-day
window is thirty such days, so it does not block a Business after a few days of
valid activity; global capacity is twice per-Business capacity in both windows.

**The synthetic-funds ceiling is a safety fuse**, not a balance, campaign or
regulatory limit: it bounds the fictitious value in circulation across the whole
internal Sandbox against accidental unlimited minting, runaway fixtures, bugs
and abuse of test top-ups. Kz 250 000 000 leaves room for a Kz 100 000 000
campaign alongside other activity.

**Top-up.** With no balance cap to bound it, a top-up has an explicit
per-operation maximum of Kz 50 000. Balance 80 000 + top-up 50 000 = 130 000 is
valid. A top-up over the maximum is refused with the per-operation code.

**Not changed.** Insufficient-funds checks, ledger balancing, wallet ownership,
idempotency, integer money, Sandbox/LIVE isolation, settlement semantics. All of
these values are voluntary Banzami Sandbox test policy; none is a BNA or LIVE
limit (`docs/compliance/SANDBOX_OPERATIONAL_LIMITS.md`).

**Follow-up (not blocking).** Expose the current operational limits through the
API and SDK — `payment_max_per_operation`, `consumer_daily_payment_limit`,
`business_received_24h_limit`, `consumer_wallet_max_balance = null`,
`business_wallet_max_balance = null` — so that integrators can validate early
without duplicating constants.
