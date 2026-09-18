# ADR — Pilot Limit Policy Overlay for Internal Sandbox

Version: 1.0
Status: Accepted
Date: 2026-07-08

## Context

The Phase 0 / Fase 1 internal test plan (Plano de Teste Detalhado Banzami V1.0)
defines automatic, system-enforced pilot limits for a controlled pilot. The
operator already enforces a general **KYC-tier** limit model (single/daily limits
by verification level) plus request rate limits. The specific V1.0 pilot limits
(per-payment 25.000, consumer daily 50.000, balance caps, merchant receiving
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
| Consumer per payment | Kz 25 000 | `engine.rs::authorize_operation` → `overlay_consumer_payment` | via the authorization route only |
| Consumer daily | Kz 50 000 | same | via the authorization route only |
| Consumer max balance | Kz 50 000 | `pilot_enforce::check_funding` (consumer funding) | **yes** |
| Aggregate funds in circulation | Kz 500 000 | `pilot_enforce::check_funding` (consumer funding) | **yes** |
| Merchant per receive | Kz 25 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Merchant max balance | Kz 100 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Merchant rolling 24h volume | Kz 250 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Merchant rolling 30d volume | Kz 1 000 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Global rolling 24h volume | Kz 500 000 | `pilot_enforce::check_merchant_credit` | **yes** |
| Global rolling 30d volume | Kz 4 000 000 | `pilot_enforce::check_merchant_credit` | **yes** |

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

**Interaction to be aware of.** `MERCHANT_MAX_BALANCE` (Kz 100 000) is *lower*
than `MERCHANT_ROLLING_24H` (Kz 250 000), so a merchant that never settles or
pays out hits the balance cap first. Only a merchant that actually moves money
onward reaches its volume window. That is intended — a stock cap and a flow cap
answer different questions — but it surprises anyone reading the numbers alone.

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
