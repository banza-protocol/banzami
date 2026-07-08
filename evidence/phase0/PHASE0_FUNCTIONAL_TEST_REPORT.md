# Phase 0 — Pilot Limit Policy Baseline and Synthetic Test Harness

Version: 1.0
Generated: 2026-07-08T21:02:18Z
Plan: Plano de Teste Detalhado Banzami V1.0
Completion: PARTIAL — policy baseline + synthetic harness; live-API end-to-end DEFERRED

## Scope

Internal technical Sandbox only. Synthetic participants and balances only. No real money, customers, external providers, public access, LIVE, Production or BNA claim. This pass validates the pilot-limit policy at the code/unit level, the operator core financial suite, a live read-only Sandbox safety inspection, and evidence sanitisation. Live-API end-to-end synthetic-traffic execution against the deployed Sandbox is DEFERRED to the follow-up (PHASE0_FOLLOWUP_LIVE_API.md). This is NOT a claim of full Phase 0 completion.

## Genuine executions

- Pilot-limit policy unit tests — `cargo test -p banzami-compliance --lib`: 45 passed, 0 failed.
- Core financial test-suite — `cargo test --lib`: 194 passed, 0 failed.
- Live Sandbox safety inspection: performed (read-only).

## V1.0 pilot-limit runtime enforcement status

| Limit | Runtime wiring | Unit test | Live-API |
|-------|----------------|:---------:|:--------:|
| consumer_per_payment | runtime-authorization | PASS | DEFERRED |
| consumer_daily | runtime-authorization | PASS | DEFERRED |
| consumer_max_balance | policy-function | PASS | DEFERRED |
| merchant_per_received | policy-function | PASS | DEFERRED |
| merchant_daily_receiving | policy-function | PASS | DEFERRED |
| merchant_max_balance | policy-function | PASS | DEFERRED |
| aggregate_funds | policy-function | PASS | DEFERRED |
| aggregate_volume | policy-function | PASS | DEFERRED |

- **runtime-authorization** = enforced at the compliance authorization point before ledger posting.
- **policy-function** = deterministic policy implemented + unit-tested; runtime wiring at its data-layer boundary is DEFERRED (follow-up).
- Live-API end-to-end verification is DEFERRED for all limits in this pass.

## Summary

PASS 3 · FAIL 0 · SIMULATED 2 · DEFERRED 19 · total 24

## Result matrix

| ID | Test | Validation this pass | Result |
|----|------|----------------------|:------:|
| F0-001 | Sandbox health and service allowlist | live read-only Sandbox safety inspection | PASS |
| F0-002 | Synthetic consumer onboarding | core-suite (cargo) coverage; synthetic fixtures | DEFERRED |
| F0-003 | Synthetic merchant onboarding | core-suite (cargo) coverage; synthetic fixtures | DEFERRED |
| F0-004 | Wallet/account creation | core-suite (cargo) coverage | DEFERRED |
| F0-005 | Synthetic balance allocation | synthetic fixtures generated | DEFERRED |
| F0-006 | QR payment success | core-suite (qr) coverage | DEFERRED |
| F0-007 | Payment link success | core-suite (payment-links) coverage | DEFERRED |
| F0-008 | Payment intent create-confirm-complete | core-suite (transactions/collections) coverage | DEFERRED |
| F0-009 | Ledger double-entry integrity | core-suite (ledger) coverage | DEFERRED |
| F0-010 | Idempotent payment retry | core-suite (transactions) coverage | DEFERRED |
| F0-011 | Duplicate payment prevention | core-suite (transactions) coverage | DEFERRED |
| F0-012 | Insufficient balance rejection | core-suite (wallets) coverage | DEFERRED |
| F0-013 | Per-payment limit rejection | pilot-unit + runtime-authorization wiring | DEFERRED |
| F0-014 | Consumer daily limit rejection | pilot-unit + runtime-authorization wiring | DEFERRED |
| F0-015 | Merchant receiving limit rejection | pilot-unit (policy function) | DEFERRED |
| F0-016 | Aggregate synthetic funds limit rejection | pilot-unit (policy function) | DEFERRED |
| F0-017 | Invalid QR/payment request rejection | core-suite (qr negative-path) coverage | DEFERRED |
| F0-018 | Failed payment rollback | core-suite (ledger/transactions) coverage | DEFERRED |
| F0-019 | Service restart recovery | tabletop/deploy-level (services previously healthy) | SIMULATED |
| F0-020 | Daily reconciliation simulation | core-suite (reconciliation) coverage | DEFERRED |
| F0-021 | Complaint/refund simulation (synthetic balance) | core-suite (refund surface) coverage | DEFERRED |
| F0-022 | Incident material classification simulation | tabletop simulation (documented) | SIMULATED |
| F0-023 | Evidence sanitisation check | sanitise.mjs over evidence/phase0 | PASS |
| F0-024 | Phase 0 closure report | this report (narrowed scope) | PASS |

## Status legend

- **PASS** — fully validated this pass without live-API traffic.
- **DEFERRED** — requires live-API end-to-end synthetic traffic against the deployed Sandbox (see `PHASE0_FOLLOWUP_LIVE_API.md`).
- **SIMULATED** — tabletop/simulated operational scenario (NOT an operational PASS).
- **FAIL** — a genuine failure (none).

## Non-claims

This is NOT a claim of full Phase 0 completion. No LIVE, Production, real-money payment, external payment provider, customer data, public access, DNS/certificate/SMTP change, or BNA approval/admission is claimed. Phase 0 amounts are synthetic and non-monetary.
