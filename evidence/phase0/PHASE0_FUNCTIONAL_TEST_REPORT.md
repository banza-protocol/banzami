# Phase 0 — Live-API Sandbox Evidence for QR and Pilot Limits

Version: 1.0
Generated: 2026-07-09T08:12:00Z
Plan: Plano de Teste Detalhado Banzami V1.0
Completion: PARTIAL — proves the pilot-enabled Sandbox redeploy and live-API onboarding, wallet creation, synthetic funding, QR payment, double-entry, idempotency, insufficient-balance, invalid-QR and the key pilot-limit rejections. Does NOT complete all Phase 0 flows (see DEFERRED / SIMULATED below).

## Scope

Internal technical Sandbox only. Synthetic participants and balances only. No real money, customers, external providers, public access, LIVE, Production or BNA claim. Live-API calls were made over the internal-only network via `docker exec <service> curl` against the deployed pilot-enabled Sandbox. Auth was bootstrapped by minting SANDBOX JWTs with the Sandbox's own signing secret held only in volatile memory (never logged, persisted, committed or reported). **This is NOT a claim of full Phase 0 / production completion.**

### What this pass does and does not prove

**Proven live (PASS):** pilot-enabled redeploy; onboarding; wallet creation; synthetic funding; QR payment success; ledger double-entry; idempotency; insufficient-balance rejection; invalid-QR rejection; and the pilot-limit rejections for consumer per-payment, consumer daily, consumer max balance, merchant daily receiving and aggregate funds (each with no balance/ledger mutation).

**Not completed this pass:**
- **DEFERRED** — F0-007 payment links, F0-008 payment intents, F0-020 reconciliation, F0-021 refund/complaint simulation.
- **SIMULATED** — F0-019 service restart recovery (tabletop/deploy-level); F0-022 incident material classification (tabletop).
- **SIMULATED at live-API level** — merchant per-received, merchant max balance and aggregate volume caps: structurally shadowed by an equal/lower cap at the API layer, or impractical to drive at API volume; covered by the merged real-DB integration tests.

## Genuine executions

- Live-API synthetic E2E against the pilot-enabled Sandbox: **13 passed, 0 failed** (F0-006/009/010/012/013/014/005/015/016/017 + no-mutation readbacks).
- Pilot-limit policy unit tests — `cargo test -p banzami-compliance --lib`: 45 passed, 0 failed.
- Pilot enforcement integration tests (real DB) — `cargo test -p banzami-compliance --test pilot_enforcement_integration`: 8 passed, 0 failed.
- Core financial test-suite — `cargo test --lib`: 194 passed, 0 failed.
- Live Sandbox safety inspection: performed (read-only).

## V1.0 pilot-limit runtime enforcement status

| Limit | Runtime wiring | Unit test | Live-API |
|-------|----------------|:---------:|:--------:|
| consumer_per_payment | runtime-authorization (qr pay) | PASS | **PASS** (F0-013) |
| consumer_daily | runtime-authorization (qr pay) | PASS | **PASS** (F0-014) |
| consumer_max_balance | check_funding (deposit + test-credit) | PASS | **PASS** (F0-005) |
| merchant_per_received | check_merchant_receipt (qr pay) | PASS | SIMULATED* |
| merchant_daily_receiving | check_merchant_receipt (qr pay) | PASS | **PASS** (F0-015) |
| merchant_max_balance | check_merchant_receipt (qr pay) | PASS | SIMULATED* |
| aggregate_funds | check_funding (deposit + test-credit) | PASS | **PASS** (F0-016) |
| aggregate_volume | check_volume (qr pay) | PASS | SIMULATED* |

\* **SIMULATED** = engine-verified by the real-DB integration suite, not independently triggerable through the live payment API. Merchant per-received (25.000) equals the consumer per-payment cap, so a >25.000 receipt is blocked on the payer side first; merchant max balance (100.000) equals the merchant daily cap, which trips first on the same crossing receipt; aggregate volume (2.000.000) is impractical to drive at API throughput under the per-payment/daily caps. No live test ran and failed.

## Pilot-limit rejection proof (five caps proven live)

For F0-013, F0-014, F0-005, F0-015 and F0-016, each rejection was verified to:
deterministic `PILOT_LIMIT_*` code · consumer balance unchanged · merchant balance
unchanged · ledger unchanged (balances are ledger-derived) · transaction not
completed · no partial posting (paired before/after readback identical).

## Summary

PASS 17 · FAIL 0 · SIMULATED 3 · DEFERRED 4 · total 24

## Result matrix

| ID | Test | Validation this pass | Result |
|----|------|----------------------|:------:|
| F0-001 | Sandbox health and service allowlist | live `/health` + read-only safety inspection | PASS |
| F0-002 | Synthetic consumer onboarding | live-API start/verify/complete (routable handle) | PASS |
| F0-003 | Synthetic merchant onboarding | live-API `/v1/merchants` | PASS |
| F0-004 | Wallet/account creation | live-API merchant wallet + consumer wallet | PASS |
| F0-005 | Funding + consumer max-balance cap | live-API test-credit + `CONSUMER_BALANCE` rejection + no-mutation | PASS |
| F0-006 | QR payment success | live-API `/v1/qr/pay` COMPLETED | PASS |
| F0-007 | Payment link success | core-suite coverage; live flow not driven | DEFERRED |
| F0-008 | Payment intent create-confirm-complete | core-suite coverage; live flow not driven | DEFERRED |
| F0-009 | Ledger double-entry integrity | live-API balance readback (−200.000 / +200.000) | PASS |
| F0-010 | Idempotent payment retry | live-API same-key retry, no double charge | PASS |
| F0-011 | Duplicate payment prevention | idempotency-covered by F0-010 | SIMULATED |
| F0-012 | Insufficient balance rejection | live-API `INSUFFICIENT_FUNDS` | PASS |
| F0-013 | Per-payment limit rejection | live-API `PER_PAYMENT` + no-mutation | PASS |
| F0-014 | Consumer daily limit rejection | live-API `CONSUMER_DAILY` + no-mutation | PASS |
| F0-015 | Merchant receiving limit rejection | live-API `MERCHANT_DAILY` + no-mutation | PASS |
| F0-016 | Aggregate synthetic funds limit rejection | live-API `AGGREGATE_FUNDS` + no-mutation | PASS |
| F0-017 | Invalid QR/payment request rejection | live-API `BAD_REQUEST` | PASS |
| F0-018 | Failed payment rollback (no partial posting) | live-API no-mutation readbacks on all rejections | PASS |
| F0-019 | Service restart recovery | tabletop/deploy-level | SIMULATED |
| F0-020 | Daily reconciliation simulation | core-suite coverage; live job not driven | DEFERRED |
| F0-021 | Complaint/refund simulation | core-suite coverage; live flow not driven | DEFERRED |
| F0-022 | Incident material classification simulation | tabletop simulation | SIMULATED |
| F0-023 | Evidence sanitisation check | sanitise.mjs over evidence/phase0 | PASS |
| F0-024 | Phase 0 closure report | this report + PHASE0_LIVE_API_RESULTS.md | PASS |

## Status legend

- **PASS** — validated live against the deployed Sandbox (or read-only for F0-001/023/024).
- **DEFERRED** — a non-limit flow not driven live this pass (links, intents, reconciliation, refund).
- **SIMULATED** — engine/tabletop-verified, not independently driven live.
- **FAIL** — a genuine failure (none).

## Non-claims

This is NOT a claim of full Phase 0 / production completion. No LIVE, Production, real-money payment, external payment provider, customer data, public access, DNS/certificate/SMTP change, or BNA approval/admission is claimed. No infrastructure was reset and no migrations were run. Phase 0 amounts are synthetic and non-monetary.
