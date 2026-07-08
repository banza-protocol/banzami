# Phase 0 Functional Test Report

Version: 1.0
Generated: 2026-07-08T20:49:06Z
Plan: Plano de Teste Detalhado Banzami V1.0
Profile: phase0-internal-sandbox

## Scope

Internal technical Sandbox only. Synthetic participants and synthetic balances only. No real money, customers, external providers, public access, LIVE, Production or BNA claim. Validation was performed at the operator code/test-suite level, via pilot-policy unit tests, a live read-only Sandbox safety inspection, and an evidence sanitisation check. Live-API end-to-end synthetic-traffic execution against the deployed Sandbox was NOT performed in this pass.

## Executions (genuine)

- Pilot-limit policy unit tests — `cargo test -p banzami-compliance --lib`: 45 passed, 0 failed.
- Core financial test-suite — `cargo test --lib`: 194 passed, 0 failed.
- Live Sandbox safety inspection: performed (read-only).

## Summary

PASS 22 · FAIL 0 · SIMULATED 2 · NOT_RUN 0 · total 24

## Result matrix

| ID | Test | Execution level | Result | Evidence reference |
|----|------|-----------------|:------:|--------------------|
| F0-001 | Sandbox health and service allowlist | live-inspection | PASS | VM read-only inspection |
| F0-002 | Synthetic consumer onboarding | core-suite | PASS | compliance/consumer-wallets lib tests + synthetic fixtures |
| F0-003 | Synthetic merchant onboarding | core-suite | PASS | merchants/compliance lib tests + synthetic fixtures |
| F0-004 | Wallet/account creation | core-suite | PASS | wallets/consumer-wallets lib tests |
| F0-005 | Synthetic balance allocation | harness | PASS | synthetic fixtures (balances within pilot caps) |
| F0-006 | QR payment success | core-suite | PASS | qr engine lib tests |
| F0-007 | Payment link success | core-suite | PASS | payment-links engine lib tests |
| F0-008 | Payment intent create-confirm-complete | core-suite | PASS | transactions/collections lib tests |
| F0-009 | Ledger double-entry integrity | core-suite | PASS | ledger engine lib tests |
| F0-010 | Idempotent payment retry | core-suite | PASS | transactions/idempotency lib tests |
| F0-011 | Duplicate payment prevention | core-suite | PASS | transactions lib tests |
| F0-012 | Insufficient balance rejection | core-suite | PASS | wallets lib tests |
| F0-013 | Per-payment limit rejection | pilot-unit | PASS | pilot::tests (PILOT_LIMIT_PER_PAYMENT_EXCEEDED) + authorize_operation overlay |
| F0-014 | Consumer daily limit rejection | pilot-unit | PASS | pilot::tests (PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED) |
| F0-015 | Merchant receiving limit rejection | pilot-unit | PASS | pilot::tests (PILOT_LIMIT_MERCHANT_RECEIVE/DAILY_EXCEEDED) |
| F0-016 | Aggregate synthetic funds limit rejection | pilot-unit | PASS | pilot::tests (PILOT_LIMIT_AGGREGATE_FUNDS/VOLUME_EXCEEDED) |
| F0-017 | Invalid QR/payment request rejection | core-suite | PASS | qr engine negative-path lib tests |
| F0-018 | Failed payment rollback | core-suite | PASS | ledger/transactions atomicity lib tests |
| F0-019 | Service restart recovery | operational-sim | SIMULATED | deploy-level health verified in same-VM rebuild; live restart drill deferred |
| F0-020 | Daily reconciliation simulation | core-suite | PASS | reconciliation engine lib tests |
| F0-021 | Complaint/refund simulation (synthetic balance) | core-suite | PASS | refund operator-surface logic (ADR-034) lib coverage |
| F0-022 | Incident material classification simulation | operational-sim | SIMULATED | documented in PHASE0_INCIDENT_SIMULATION_LOG.md |
| F0-023 | Evidence sanitisation check | harness | PASS | tests/phase0/sanitise.mjs over evidence/phase0 |
| F0-024 | Phase 0 closure report | harness | PASS | PHASE0_FUNCTIONAL_TEST_REPORT.md |

## Execution-level legend

- **live-inspection** — read-only inspection of the running internal Sandbox.
- **pilot-unit** — deterministic pilot-limit policy unit test (real `cargo` run) + live authorization-point overlay.
- **core-suite** — the operator's own financial engine test-suite (real `cargo --lib` run). Validates the logic; NOT a live-API end-to-end run.
- **operational-sim** — operational scenario documented/validated at deploy level; live drill deferred.
- **harness** — produced/checked by this harness.

## Non-claims

No LIVE, Production, real-money payment, external payment provider, customer data, public access, DNS/certificate/SMTP change, or BNA approval/admission is claimed. Phase 0 amounts are synthetic and non-monetary.
