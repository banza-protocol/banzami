# Banzami Validation Studio — Phase A package

> **Canonical name: Banzami Validation Studio.** The operator application is
> `apps/validation-studio`. There is no second validation product and no
> parallel engine. Enforced by `make check-validation-naming`.

Version: 1.0
Status: Phase A COMPLETE · Phase B COMPLETE · `PHASE_C_READY=YES`
Programme: BANZAMI-SANDBOX-FULL-VALIDATION-001
Phase: A — discovery, audit and design **only**

---

## What this package is

Phase A establishes **the universe before changing it**. It is the result of an
audit of the actual repository and the actual deployed Sandbox runtime, not a
restatement of intent. Nothing here has been implemented, provisioned or run.

```
BANZAMI_VALIDATION_LAB_PHASE_A      = COMPLETE
BANZAMI_FULL_VALIDATION_SPEC_STATUS = READY_FOR_OWNER_REVIEW
IMPLEMENTATION_STARTED              = NO
VALIDATION_ACTORS_PROVISIONED       = 0
REAL_LIVE_TESTS_EXECUTED            = 0
REAL_LIVE_INFRASTRUCTURE_MUTATIONS  = 0
```

## Read this first

Three findings change the shape of the programme. They are argued in
[19 — Gap, contradiction and uncovered-capability report](19-gap-contradiction-report.md)
and summarised in [21 — Owner decisions](21-owner-decisions.md).

1. **VL-001 — the Sandbox has a one-way lifetime volume budget and it is 46.5%
   spent.** `AGGREGATE_VOLUME_MINOR` is a monotonic sum of every credit ever
   posted to a merchant account. Retiring funds does not reduce it. At today's
   consumption a repeated Full Validation Run permanently bricks merchant
   payments for every self-service Sandbox developer. **This blocks Phase B.**
2. **Three capability registries already exist** — the assurance manifest, the
   implementation matrix and the deployed-component coverage file — alongside a
   suite runner and a governance UI. The Lab must consolidate them, not become
   a fourth.
3. **~1 900 automated checks and 114 E2E harnesses already exist.** The Lab is
   an *orchestrator and a coverage invariant*, not a new test estate.

## Documents

| # | Document | Answers |
|---|---|---|
| 01 | [System architecture](01-system-architecture.md) | What the Lab is, and what it refuses to be |
| 02 | [Complete functional inventory](02-functional-inventory.md) | What exists |
| 03 | [Capability Registry specification](03-capability-registry-spec.md) | Where capability truth lives |
| 04 | [Capability → coverage matrix](04-coverage-matrix.md) | What is covered, what is not |
| 05 | [Validation Actor specification](05-actor-spec.md) | Who runs the journeys |
| 06 | [Email + auth automation](06-auth-email-automation.md) | Can authentication be autonomous |
| 07 | [BANZADMIN Validation Studio](07-banzadmin-validation-studio.md) | The operator surface |
| 08 | [Journey catalog](08-journey-catalog.md) | What gets executed |
| 09 | [Evidence model](09-evidence-model.md) | What durable proof looks like |
| 10 | [Run / resource / retention model](10-run-resource-retention.md) | Runs, residue and economic history |
| 11 | [Autonomous execution + repair](11-autonomous-execution.md) | How Claude runs and fixes |
| 12 | [SDK inventory + publication plan](12-sdk-inventory-and-publication.md) | Can SDKs publish without a human |
| 13 | [DOA validation plan](13-doa-validation-plan.md) | DOA as an ordinary integrator |
| 14 | [Receipt / comprovativo plan](14-receipt-validation-plan.md) | Proof of a financial operation |
| 15 | [Security + isolation matrix](15-security-isolation-matrix.md) | Authority negatives |
| 16 | [External dependency matrix](16-external-dependency-matrix.md) | Defect vs dependency |
| 17 | [Sandbox vs Live matrix](17-sandbox-vs-live-matrix.md) | What a Sandbox PASS does not mean |
| 18 | [Existing test / E2E tooling inventory](18-existing-tooling-inventory.md) | What to reuse |
| 19 | [Gap / contradiction report](19-gap-contradiction-report.md) | What is wrong today |
| 20 | [Phase B/C/D/E plan](20-implementation-plan.md) | What happens next |
| 21 | [Owner decisions / open questions](21-owner-decisions.md) | What only the owner can decide |
| 22 | [Owner decision review](22-owner-decision-review.md) | D1–D17, and the correction to VL-001 |
| 23 | [Architecture: control and execution](23-architecture-control-and-execution.md) | **Canonical** — BANZADMIN controls, the Studio executes |
| 24 | [Phase B completion report](24-phase-b-report.md) | What was reused, extended, refactored and deliberately not built |

Machine-readable specifications: [`schemas/`](schemas/).

## Why these paths

`docs/validation/` is already the canonical home of validation governance
(`BANZAMI_IMPLEMENTATION_MATRIX.json`, `VALIDATION_DOMAINS.md`,
`CONFIDENCE_GOVERNANCE.md`, `INVARIANT_TAXONOMY.md`). The Lab is validation
governance, so it lives under it as `docs/validation/studio/`.

The prompt suggested a top-level `validation/` directory for machine-readable
specifications. **This package deliberately does not use it.** CLAUDE.md §19.1
freezes the repository layout, and `quality/` is already defined as the home of
the canonical machine-readable capability registry. A second top-level
registry directory would create exactly the parallel authority §19.2 forbids.
Machine-readable Lab specifications therefore extend `quality/` — see
[03](03-capability-registry-spec.md).

## Evidence basis

Every factual claim in this package is traceable to one of:

- the repository at `0cdc05a2` (clean tree, `main`);
- the deployed Sandbox runtime read on 2026-09-18 (gateway `b2bfedb5`,
  core `82283af0`, app-frontend `2fbdd20f`, admin-api `bc9080ec`,
  developer-api `d2098e7b`, migration head `0159`);
- a direct database read through the operator role.

Where the repository and the runtime disagree, the runtime is recorded as the
truth and the disagreement is filed in [19](19-gap-contradiction-report.md).
