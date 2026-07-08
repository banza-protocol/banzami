# Phase 0 — Internal Functional Sandbox Test Harness

Version: 1.0

Internal, synthetic-only functional test harness for the Banzami technical
Sandbox (Plano de Teste Detalhado Banzami V1.0). It exercises the V1.0 pilot-limit
policy and the operator's financial core, and writes sanitised evidence.

**Scope:** internal technical Sandbox only; synthetic participants and synthetic
balances only. No real money, customers, external providers, public access, LIVE,
Production or BNA claim.

## Contents

| File | Purpose |
|------|---------|
| `fixtures.mjs` | Synthetic fixture generator (10 consumers, 5 merchants) — no real data |
| `sanitise.mjs` | Evidence sanitisation checker (rejects IPs/keys/JWTs/paths/etc.) |
| `run-phase0.mjs` | Runner: fixtures + genuine `cargo` tests + evidence + sanitisation |

## Run

```bash
# pilot-limit policy unit tests (no database)
cd core && cargo test -p banzami-compliance --lib

# full Phase 0 harness (writes evidence/phase0/*)
VM_SAFETY_VERIFIED=1 node tests/phase0/run-phase0.mjs

# sanitisation check only
node tests/phase0/sanitise.mjs evidence/phase0
```

`VM_SAFETY_VERIFIED=1` records F0-001 as PASS only when the running environment has
been confirmed (read-only) as the internal Sandbox: four approved services, no
host-published ports on PostgreSQL/Redis, internal networks, no LIVE/Production.

## Pilot-limit policy

Enforced by the system (not the harness) via
`core/compliance/src/pilot.rs`, gated by `BANZAMI_PILOT_LIMITS` and never active on
a live/production environment. See `docs/adr/ADR-048-pilot-limit-policy-overlay.md`.

## Execution levels in the evidence

Each Phase 0 test records how it was validated: `live-inspection`, `pilot-unit`,
`core-suite`, `operational-sim`, or `harness`. `core-suite` validates the logic via
the operator's own test-suite; it is not a live-API end-to-end run. Live-API
end-to-end synthetic-traffic execution against the deployed Sandbox is a separate
step and is not performed by this harness.
