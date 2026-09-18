# 11 — Autonomous execution and repair model

Version: 1.0

---

## 1. One control plane

Claude, CI and BANZADMIN enter through the same door. There is no private
validation path.

**Canonical entry point: `make` targets wrapping `tools/validationctl.mjs`.**

```bash
make validation-full          # FULL_SANDBOX run
make validation-golden        # GOLDEN run (refuses on a dirty tree)
make validation-targeted SUITES=S06,S09
make validation-impact REF=origin/main   # change-impact closure of a diff
make validation-health        # preflight only
```

Why `make` rather than a new `validationctl` binary: the repository already has
236 `make` targets and every gate, suite and assurance runner is reached that
way. A new top-level CLI would be a second convention for no capability gain,
and CLAUDE.md §17 is explicit about not adding primitives without operational
need. `tools/validationctl.mjs` is the implementation; `make` is the interface.

BANZADMIN's *Executar validação* button invokes the same module server-side. It
does not shell out to a different script, and this is checkable: a guard asserts
that the Lab has exactly one runner entry point.

## 2. The repair loop

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  preflight (doc 07 §6) — UNHEALTHY ⇒ stop, report infrastructure  │
  └───────────────────────────────┬──────────────────────────────────┘
                                  ▼
                        run journey (doc 08)
                                  │
                 ┌────────────────┴────────────────┐
              PASS                               FAIL
                 │                                 │
                 │                    preserve evidence FIRST
                 │                                 │
                 │                          reproduce
                 │                                 │
                 │                    identify root cause
                 │                                 │
                 │              determine the CANONICAL owning layer
                 │              (core / gateway / BFF / app / SDK / docs)
                 │                                 │
                 │                     implement the proper fix
                 │                                 │
                 │                  add regression protection ◀── mandatory
                 │                                 │
                 │                 local unit + integration tests
                 │                                 │
                 │                       commit · push
                 │                                 │
                 │                    deploy Sandbox (./deploy.sh)
                 │                                 │
                 │                 VERIFY the deployment took
                 │                 (read the served revision, doc 10 §2)
                 │                                 │
                 │                    rerun the failed journey
                 │                                 │
                 │           rerun the change-impact closure (§5)
                 │                                 │
                 └────────────────┬────────────────┘
                                  ▼
                       continue the overall run
```

Three steps are load-bearing and easy to skip:

**Evidence before reproduction.** A failure that is reproduced first is often
a failure whose original artifacts are gone.

**The canonical owning layer.** A ledger bug fixed in the gateway is a bug
moved, not fixed. CLAUDE.md's protocol-first rule applies: if the defect is a
*financial or protocolar concept*, it starts in `~/banza` as an ADR and the Lab
records the journey as `EXTERNAL_DEPENDENCY` on that ADR — it does not patch a
protocol rule locally.

**Verify the deployment took.** The memory of this repository already records
the failure mode: a fix that does not appear in production because a container
in the call chain was not rebuilt. The loop reads the served revision rather
than trusting `deploy.sh` exiting zero.

## 3. Claude must not stop early

Not valid reasons to stop:

the task is large · the fix touches several services · the fix is multi-file ·
the suite is long · the session is near a stopping point · the fix needs a
migration, UI, SDK or documentation change · finding a defect at all.

**Finding a defect is the middle of the work, not the end.** The expected
behaviour is FIX AND CONTINUE.

## 4. Valid stop conditions

Only after every independent piece of work is complete:

| Condition | Why it is genuinely terminal |
|---|---|
| External service outage (npm, Resend, R2, DOA) | not the operator's to fix |
| Owner-only credential ceremony not yet performed | cannot be safely preconfigured |
| Cash-In / Cash-Out external rail | no counterparty exists |
| Real-Live boundary | out of scope by design |
| Physical-device-only capability | cannot be emulated (rare — see doc 18 §5) |
| **Aggregate volume budget exhausted** | continuing would brick the public Sandbox |

The last one is new, and it is why [19](19-gap-contradiction-report.md) VL-001
blocks Phase B. A budget-exhausted stop is *correct* behaviour, but a Lab that
hits it has already done irreversible harm — the design must prevent reaching
it, not merely stop there.

Ordinary complexity is never a valid stop.

## 5. Change-impact validation

The capability dependency graph (`depends_on`, doc 03 §2) turns a diff into a
journey set:

```
diff touches core/collections/**
   → CAP-COLLECT-001
   → dependents: CAP-PAY-002 (share surfacing), CAP-PROOF-001 (receipts)
   → cross-cutting: CAP-LEDGER-001 → S09 financial truth (always)
   → surfaces: Business Web (S03), payer (S05), webhooks (S13) if events fire
   → SDK: any method touching collections (S12)
   ⇒ run S06, S09, S03, S05, S13, S12
```

Rules:

- a change to any `financial-money-movement` capability **always** pulls in S09;
- a change to a shared Flutter source path pulls in both S02 and S03;
- a change to `services/common/**` pulls in every Go service's suites;
- a change to a contract pulls in S19 and S12.

This is what makes a Repair Run affordable: it reruns the closure, not the
universe.

## 6. Defect records

```json
{
  "defect_id": "DEF-20260918-0003",
  "run_id": "BZV-20260918-0001-0cdc05a2",
  "journey_id": "S06-COL-002", "capability_id": "CAP-COLLECT-001",
  "severity": "high",
  "evidence": ["S06/S06-COL-002/api/requests.jsonl", "…/ledger/postings.json"],
  "root_cause": "…",
  "owning_layer": "core/collections",
  "fix_commit": "…", "deployed_revision": "…",
  "regression_test": "core/collections/tests/idempotency.rs::changed_op_is_refused",
  "revalidation": { "journey": "PASS", "impact_closure": ["S09","S03"], "result": "PASS" }
}
```

A defect without `regression_test` cannot be closed. The rule from this
repository's own practice applies: **a guard must be mutation-proven** — the
regression test is shown failing for the right reason before the fix is
accepted.

## 7. Repair Run vs certification

Any product, runtime, SDK, configuration or executable-documentation change
during a validation attempt makes that execution a **Repair Run**. A Repair Run
can never become the certification run — not because of a rule, but because its
early journeys ran against different code than its late ones.

## 8. Flakiness

Retries diagnose infrastructure; they never manufacture a PASS.

- every attempt is recorded with its evidence and its retry reason;
- a retry is permitted **only** when the preflight class of the failure is
  infrastructure (timeout, connection reset, provider 5xx);
- an assertion failure is **never** retried;
- a journey that needed an unexplained retry is reported as
  `PASS_WITH_RETRY` and counted; a Golden Run requires that count to be **0**.

`PASS_WITH_RETRY` exists so that flakiness has to be looked at rather than
absorbed.

## 9. Determinism

Fixed amounts and descriptions per journey, derived from the journey id. Handles
and resource labels carry the `run_id` so any row can be traced to its origin.
**No journey asserts an absolute accumulated balance** — only deltas — because
actors are persistent and absolute balances legitimately change between runs.

## 10. Relationship to CI

| | CI (per PR) | Validation Lab |
|---|---|---|
| Runs | 23 jobs: Rust, 5 Go services, frontends, SDKs, migrations, security | deployed-Sandbox journeys |
| Speed | minutes | tens of minutes to hours |
| Needs | no deployment | the deployed Sandbox, actors, browser, camera, email, registries |
| Proves | the source is correct | the *platform* works |

CI keeps the 71 static gates, unit and integration tests, and contract drift
checks. The Lab owns everything that needs a running Sandbox. **A pull request
never waits for a Golden Run.** The Lab runs on merge to `main`, on demand, and
before a release.
