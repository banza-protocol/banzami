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

## Ledger integrity

Reconciliation is read-and-compare; it performs no postings. Double-entry integrity
is validated separately (ledger engine suite, mapped to F0-009). Pilot-limit
rejections leave the ledger unchanged (mapped to F0-013..F0-016).

## Non-claims

Synthetic data only. No real settlement, no external payment rail, no real-money
movement. Daily operational reconciliation against real rails is a Fase 1 activity
subject to BNA approval and the approved safeguarding structure.
