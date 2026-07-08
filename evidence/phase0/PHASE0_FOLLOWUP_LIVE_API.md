# Phase 0 — Follow-up Ticket: Live-API End-to-End Execution

Version: 1.0
Status: OPEN (deferred from the policy-baseline PR)

This follow-up covers the work explicitly **deferred** from the Phase 0 policy
baseline. It must be completed before Phase 0 can be declared operationally
complete. Synthetic-only; no real money, customers, external providers, public
access, LIVE, Production or BNA claim.

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
