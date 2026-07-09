# Phase 0 — Reconciliation Simulation Summary

Version: 1.0

Internal, synthetic reconciliation validation for Phase 0. No real money, no real
external statements — synthetic internal/external reference sets only.

## Method

The operator reconciliation engine (`core/reconciliation`) matches internal ledger
postings against an external reference set and reports discrepancies. Phase 0 uses
synthetic reference sets; the engine's own test-suite (`cargo test -p
banzami-reconciliation --lib`) exercises matched, missing and mismatched cases and
passes.

## Synthetic scenarios validated (engine-level)

| Scenario | Expectation | Result |
|----------|-------------|:------:|
| Fully matched internal vs external | zero discrepancy | PASS |
| Internal present, external missing | discrepancy reported | PASS |
| External present, internal missing | discrepancy reported | PASS |
| Amount mismatch | discrepancy amount reported | PASS |
| Multi-item mixed set | per-item classification | PASS |

## Live synthetic reconciliation (F0-020) — computed from actual test outputs

A live end-to-end reconciliation was computed from this run's actual synthetic
operations against the live ledger-derived balances (read back through the balance
APIs). For each participant, the expected balance (from the funding, payments and
refunds performed) is compared to the actual ledger-derived balance; a zero
discrepancy demonstrates ledger integrity across the exercised flows.

| Participant | Operations this run | Expected (minor) | Actual/ledger (minor) | Discrepancy |
|-------------|---------------------|-----------------:|----------------------:|:-----------:|
| Consumer A (payer) | funded +300 000; −40 000 (intent pay); −40 000 (QR pay) +40 000 (refund) | 260 000 | 260 000 | 0 |
| Consumer B (requester) | +40 000 (intent settle) | 40 000 | 40 000 | 0 |
| Merchant wallet | +40 000 (QR pay) −40 000 (refund reversal) | 0 | 0 | 0 |

Total discrepancy: **0** across the synthetic test set → **PASS**. (Values are
synthetic minor units; the payment-link acquiring settlement is a separate rail and
is excluded from this wallet-native reconciliation — see F0-007.)

## Ledger integrity

Reconciliation is read-and-compare; it performs no postings. Double-entry integrity
is validated separately (ledger engine suite, mapped to F0-009). Pilot-limit
rejections leave the ledger unchanged (mapped to F0-013..F0-016). The F0-021 refund
posts a balanced reversal (DR merchant.available / CR consumer.available), confirmed
by the before/after balance readback above.

## Non-claims

Synthetic data only. No real settlement, no external payment rail, no real-money
movement. Daily operational reconciliation against real rails is a Fase 1 activity
subject to BNA approval and the approved safeguarding structure.
