# 20 — Phase B / C / D / E implementation plan

Version: 1.0
Gate: **Phase B does not begin until the owner approves this package and
decides D1** ([21](21-owner-decisions.md)).

---

## Phase B — Validation Studio foundation

**Entry gate: VL-001 resolved.** Nothing else in the programme is safe to build
until the Sandbox's irreversible volume budget has a sustainable answer.

| # | Work | Output |
|---|---|---|
| B0 | **Implement the owner's D1 decision** on the aggregate volume cap; add a budget preflight that refuses a run without headroom | Sandbox survives repeated runs |
| B1 | Extend the assurance manifest schema (doc 03 §2) | 9 new fields |
| B2 | Enter the ~26 missing capability areas; correct `CAP-COLLECT-001`, `CAP-APP-001/005`; add `CAP-APPWEB-*` | ~70 capabilities |
| B3 | Add the **mounted ⊆ declared** drift gate with an `unclassified_routes` ledger | closes VL-004/VL-006 |
| B4 | Create `quality/validation/{actors,journeys,suites,resources}.yaml` + schemas | registries |
| B5 | Add `app-frontend` and `banzami-webhook-sink` to deploy parity and the asset inventory | closes VL-005/VL-017 |
| B6 | **Owner ceremony**: enrol `A01` TOTP; place actor secrets | autonomous BANZADMIN |
| B7 | Provision `C01–C03`, `D01–D02` (self-service), then `B01–B03` (needs `A01`) | 9 persistent actors |
| B8 | Actor-leakage guard + DOA-special-behaviour guard | invariants held mechanically |
| B9 | BANZADMIN `/validation`: Overview, Actors, Capabilities, Health (read-only) | operator visibility |
| B10 | `CapValidation*` RBAC + audit | doc 07 §8 |
| B11 | Evidence store: R2 bucket, manifest schema, redaction writer + post-scan | doc 09 |
| B12 | Decide VL-009 (`sandbox-operator`) and VL-013 (SDK licensing) | contradictions closed |

Exit: registries exist and are coherent; actors authenticate unattended; Health
reports green; **no journey has run**.

## Phase C — Validation harness

| # | Work |
|---|---|
| C1 | `tools/validationctl.mjs` by extending `run-assurance.mjs`; `make validation-*` targets |
| C2 | Journey definition loader + verdict discipline (exit → summary → UNKNOWN) |
| C3 | **Adapters for the 114 existing harnesses** — orchestrate, never rewrite |
| C4 | Browser layer from `tools/e2e/app-web/lib` (pinned Chromium, fake camera, page objects) |
| C5 | Email automation: fixture sessions + Resend readback (doc 06) |
| C6 | Webhook layer over the existing sink |
| C7 | SDK external-consumer acceptance, generalised from `sdk-public-install-proof.mjs` |
| C8 | Financial assertion library: pre/post deltas, double-entry, boundary reconciliation |
| C9 | Evidence collection + manifest + hashing wired into every journey |
| C10 | **New journeys for the nine uncovered areas** — S23 rail fail-closed first (VL-007) |
| C11 | Capability dependency graph + change-impact selection (doc 11 §5) |
| C12 | Defect records, flake policy, `PASS_WITH_RETRY` |
| C13 | BANZADMIN Journeys / Runs / Evidence pages; run control |
| C14 | Concurrency lock |

Exit: `make validation-full` executes end to end and produces a complete,
evidence-backed result — **whatever that result is**.

## Phase D — First Full Sandbox Validation (a Repair Run by definition)

1. Deploy everything (closes VL-003).
2. Run `make validation-full`. Expect a large first failure set — doc 04 §5
   projects ~9 uncovered areas and ~145 drifting routes.
3. Repair loop (doc 11 §2) until green: fix in the canonical owning layer, add a
   mutation-proven regression, deploy, verify the deployment took, rerun the
   change-impact closure, continue.
4. SDK work as needed: fix → test → version → publish via trusted publishing →
   clean external install → rerun.
5. Documentation reconciliation: VL-010, VL-014, VL-015, VL-016, OpenAPI, docs
   examples, error catalogue, `sdk/README.md`.
6. Escalate any **protocol** defect to `~/banza` as an ADR; classify the journey
   `EXTERNAL_DEPENDENCY` on it rather than patching a protocol rule locally.

Exit: zero failing implemented capabilities; zero unclassified capabilities;
zero uncovered implemented capabilities; SDK versions frozen; docs reconciled.

## Phase E — First Golden Validation Run

Preconditions, all verified before the run starts:

```
repository clean · local main == origin/main
every deployed component at this tree's source (parity clean)
migration head == repository head
SDK packages at final published versions, source frozen to match
DOA current · documentation reconciled
9 actors healthy · evidence store healthy · budget headroom sufficient
```

During the run: **no** source change, SDK publication, contract edit, executable
documentation edit, configuration correction or deploy. Any need for one fails
the run as certification — fix it, then start a **new** Golden Run from the
beginning.

Target:

```
ZERO failed implemented capabilities        ZERO unclassified capabilities
ZERO implemented-but-uncovered              ZERO known Sandbox product defects
ZERO contract contradictions                ZERO unexpected E2E residue
ZERO unredacted secrets in evidence         ZERO PASS_WITH_RETRY
ZERO real-Live mutations

CASH_IN  = NOT_IMPLEMENTED (external boundary; internal substrate present)
CASH_OUT = EXTERNAL_DEPENDENCY at the rail; PASS at the operator boundary
REAL_LIVE_TESTS_EXECUTED = 0
```

Golden Run evidence is retained indefinitely.

## Sequencing risks

| Risk | Handling |
|---|---|
| **VL-001 unresolved** | hard gate — Phase B cannot start |
| Registry expansion 24 → ~70 is large | `unclassified_routes` ledger allows incremental adoption; Golden requires it empty |
| Phase D discovers protocol defects | escalate to `~/banza`; do not patch locally; classify and continue |
| Owner ceremonies block progress | B6 is the only hard one; batch it with B7 |
| SDK trusted publishing not configured | Repair Runs cannot ship SDK fixes — owner decision D4 |
| Rebuilding instead of orchestrating | C3 is explicitly an adapter task; the `existing_harness` field makes omissions visible |

## What Phase A deliberately did not do

No migration, no BANZADMIN route, no actor, no mailbox, no secret, no product
API change, no package published, no financial journey executed, no Live
mutation. Every need discovered is recorded above rather than acted on.
