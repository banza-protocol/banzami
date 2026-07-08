# Phase 0 — Pilot Limits Evidence

Version: 1.0

Evidence that the V1.0 pilot limits are enforced by the **system under test** (a
stricter overlay on the KYC-tier model), config-gated to the internal Sandbox /
Phase 0 profile, and unit-verified. Amounts are synthetic and non-monetary.

Implementation: `core/compliance/src/pilot.rs` (policy + deterministic codes),
wired into the compliance authorization point (`authorize_operation`) for consumer
payments. Decision record: `docs/adr/ADR-048-pilot-limit-policy-overlay.md`.

## Limits (V1.0)

| Limit | Value (Kz) | Minor units | Rejection code |
|-------|-----------:|------------:|----------------|
| Consumer per payment | 25.000 | 2 500 000 | `PILOT_LIMIT_PER_PAYMENT_EXCEEDED` |
| Consumer daily | 50.000 | 5 000 000 | `PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED` |
| Consumer max balance | 50.000 | 5 000 000 | `PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED` |
| Merchant per received | 25.000 | 2 500 000 | `PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED` |
| Merchant daily receiving | 100.000 | 10 000 000 | `PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED` |
| Merchant max balance | 100.000 | 10 000 000 | `PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED` |
| Aggregate funds in circulation | 500.000 | 50 000 000 | `PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED` |
| Aggregate transaction volume | 2.000.000 | 200 000 000 | `PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED` |

## Enforcement model

- **Consumer per-payment / daily** — enforced at the compliance authorization
  point before ledger posting; a violation returns the deterministic code and the
  operation is blocked (balances and ledger unchanged).
- **Consumer/merchant balance, merchant receiving, aggregate** — deterministic
  policy functions provided for enforcement at the data layers that own the
  balance/aggregate context (unit-verified here; live wiring into each engine is
  tracked as follow-up in ADR-048).
- **Config gate** — enabled only for the Sandbox/Phase 0 profile; disabled by
  default; never active on a live/production environment.
- **No internal thresholds are exposed** in API responses (generic message only).

## Unit-test evidence (genuine `cargo` run)

Command: `cargo test -p banzami-compliance --lib` — all pilot tests pass, alongside
the existing compliance suite (no regression):

| Test | Asserts |
|------|---------|
| `pilot::tests::disabled_policy_allows_everything` | overlay is a no-op when disabled |
| `pilot::tests::consumer_per_payment_boundary_and_over` | at-cap allowed; over-cap → per-payment code |
| `pilot::tests::consumer_daily_cumulative_over` | cumulative daily over → daily code |
| `pilot::tests::consumer_balance_cap` | balance-after-credit over → balance code |
| `pilot::tests::merchant_receipt_per_and_daily` | per-receive and daily-receive codes |
| `pilot::tests::merchant_balance_cap` | merchant balance code |
| `pilot::tests::aggregate_funds_and_volume` | aggregate funds and volume codes |
| `pilot::tests::overlay_only_applies_to_consumer_payments` | overlay scoped to consumer payments; disabled passthrough |
| `pilot::tests::from_env_is_safe_by_default` | safe-by-default gate |
| `pilot::tests::limit_values_match_v1_policy` | constants equal the V1.0 values |

Ledger integrity is not bypassed: a rejected operation is blocked before posting,
leaving balances and the ledger unchanged.
