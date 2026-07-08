# Phase 0 — Incident Simulation Log

Version: 1.0

Internal, tabletop incident-classification simulation for Phase 0. Synthetic
scenarios only; no real incident, no real customer impact, no real money.

## Classification scale (pilot)

| Severity | Meaning (pilot) | Example (synthetic) | Handling |
|----------|-----------------|---------------------|----------|
| SEV-1 | Financial-integrity risk | synthetic double-post detected in a test run | halt pilot flows; reconcile; root-cause before resuming |
| SEV-2 | Functional failure, no integrity risk | a synthetic payment intent stuck in a non-terminal state | fix-forward; retry; document |
| SEV-3 | Degraded/limited | elevated latency on a synthetic flow | monitor; schedule fix |
| SEV-4 | Cosmetic/informational | wording of a synthetic rejection message | backlog |

## Simulated incidents (tabletop)

| # | Synthetic scenario | Classified | Expected response | Result |
|---|--------------------|:----------:|-------------------|:------:|
| 1 | Pilot per-payment limit rejects an over-cap synthetic payment | SEV-4 (expected control) | deterministic `PILOT_LIMIT_*` rejection; no posting | as-designed |
| 2 | Synthetic insufficient-balance payment attempt | SEV-4 (expected control) | rejection; balances unchanged | as-designed |
| 3 | Simulated service restart during idle | SEV-3 | services return healthy, non-root, internal-only | recovery expected (deploy-level verified) |
| 4 | Simulated ledger mismatch in a synthetic reconciliation set | SEV-1 | discrepancy reported; investigate before resuming | detection validated (recon engine) |

## Material-incident policy (pilot)

A SEV-1 (financial-integrity) event in Phase 0 halts synthetic pilot flows pending
root-cause. Because Phase 0 uses synthetic balances only, no real customer or
real-money exposure exists. Real-incident handling with regulatory notification is
a Fase 1 concern subject to BNA approval.

## Non-claims

Tabletop simulation with synthetic scenarios only. No real incident occurred; no
real customer, real money, or external party was involved.
