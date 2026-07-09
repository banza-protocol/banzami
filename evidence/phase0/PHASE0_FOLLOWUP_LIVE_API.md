# Phase 0 — Follow-up Ticket: Live-API End-to-End Execution

Version: 1.0
Status: LARGELY RESOLVED — live-API execution done; residual = non-limit flows + drills

This follow-up covered the work explicitly **deferred** from the Phase 0 policy
baseline. Synthetic-only; no real money, customers, external providers, public
access, LIVE, Production or BNA claim.

## Resolution (2026-07-09)

Section A and Section B are **done**. The pilot-enabled build was deployed to the
internal Sandbox and the full synthetic fixture chain + live-API E2E ran green (see
`PHASE0_LIVE_API_RESULTS.md`, 13/13 PASS):

- **A — runtime wiring:** consumer max balance, merchant per-received, merchant
  daily receiving, merchant max balance, aggregate funds and aggregate volume are
  all now wired at their runtime enforcement points (`check_funding`,
  `check_merchant_receipt`, `check_volume`) with the merged real-DB integration
  suite (`pilot_enforcement_integration.rs`, 8/8) asserting no ledger mutation on
  rejection. The Sandbox `test-credit` funding path was also brought under
  `check_funding`.
- **B — live-API E2E:** five of the eight caps proven live end-to-end with paired
  no-mutation readbacks (per-payment, consumer daily, consumer max balance, merchant
  daily receiving, aggregate funds). The remaining three (merchant per-received,
  merchant max balance, aggregate volume) are structurally shadowed by an
  equal/lower cap at the API layer or impractical at API volume, and stay
  engine-verified (SIMULATED) — see the results doc for the rationale.

**Residual — now resolved (2026-07-09 follow-up):** the non-limit live flows were
completed. F0-008 (intents), F0-020 (reconciliation) and F0-021 (refund) PASS live;
F0-007 (links) is SIMULATED — create + simulated-provider confirmation proven live,
but the acquiring settlement is the HMAC-signed EMIS-callback external-provider rail,
excluded by the synthetic-only constraint. The refund route was enabled by
provisioning the file-only `CORE_INTERNAL_KEY` service credential in the sandbox
deploy. DEFERRED count is now 0. Only the Section C operational drills (F0-019 restart,
F0-022 incident classification) remain SIMULATED/tabletop.

## A. Runtime enforcement wiring (remaining V1.0 limits)

The consumer per-payment and consumer daily caps are wired at the compliance
authorization point. The following remain deterministic policy functions
(unit-tested) and must be wired at their runtime data-layer enforcement points,
each with a real-database integration test:

| Limit | Enforcement point to wire |
|-------|---------------------------|
| consumer max balance | wallet credit (consumer) — reject if balance-after-credit exceeds cap |
| merchant max per received payment | merchant receipt / payment confirmation |
| merchant daily receiving limit | merchant receipt (daily received aggregate) |
| merchant max balance | wallet credit (merchant) |
| aggregate synthetic funds in circulation | system aggregate at synthetic top-up / credit |
| aggregate synthetic transaction volume | system aggregate at payment posting |

Constraints: enforce before ledger posting; a rejection must leave balances and
ledger unchanged; policy remains gated to the Sandbox/Phase 0 profile and disabled
on LIVE/Production.

## B. Live-API end-to-end synthetic tests (deployed internal Sandbox)

Deploy the pilot-enabled build to the internal Sandbox (pilot profile) and run
live synthetic API traffic for at least: F0-006, F0-007, F0-008, F0-009, F0-010,
F0-011, F0-012, F0-013, F0-014, F0-015, F0-016, F0-017, F0-018, F0-020, F0-021,
F0-023. Bootstrap synthetic merchant/consumer auth via the Sandbox onboarding and
sandbox-funding paths. Capture sanitised evidence (request/expected/actual/
PASS-FAIL) per test.

Constraints: internal-only (no host ports / public access); no real money,
customers, external providers; no DNS/certificate/SMTP change; no VM reset; no
migrations except read-only verification; no destructive infrastructure changes.

## C. Operational drills (currently SIMULATED)

- F0-019 service restart recovery — execute a live restart drill.
- F0-022 incident classification — exercise against a live synthetic incident.

## Exit criteria

All enforceable Phase 0 controls pass live-API end-to-end with synthetic data;
tabletop items are either executed live or remain clearly labelled SIMULATED; then
Phase 0 may be declared operationally complete.
