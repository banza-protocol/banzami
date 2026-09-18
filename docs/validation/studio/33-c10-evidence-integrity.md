# 33 — C.10 evidence-integrity closure

Version: 1.0
Status: Closed 2026-09-18. Two Validation Runs exist; neither was ever started.

Chronology, preserved — [32](32-phase-c-operational-closure.md) is not revised:

1. Phase C operational enablement passed
2. the first real preparation exposed missing provenance and missing `measured`
3. C.10 fixed both
4. runtime proof performed without execution
5. the pre-fix run remains historically incomplete, by design
6. the post-fix run proves capture works

---

## 1. The defect, and why the model existed but the capture did not

0160 created `validation_run_provenance` and gave `validation_preflight_checks`
a `measured` JSONB column. Neither was ever written: `Prepare()` did not insert
provenance, and the check `INSERT` omitted the `measured` column.

The Phase C report recorded C.10 as PASS on the strength of the model existing.
**That was the model, not the capture** — a distinction only a real prepared run
could expose, and it did: `BZV-20260918-0001` reached READY with 0 provenance
rows and 0 of 9 checks carrying measurements.

## 2. The mandatory component set

Deliberately small: exactly the components whose state the **preparation**
decision consulted.

| Component | Why it is mandatory | Revision source |
|---|---|---|
| `admin-api` | computed the preflight and decided READY or BLOCKED | `BANZAMI_BUILD_COMMIT` |
| `api-gateway` | the product surface a GOLDEN run is prepared against | `GET /health` → `.build` |
| `database-schema` | the ledger and actor state the budget/actor checks measured | `_sqlx_migrations` |
| `validation-registry` | the actor, suite and profile definitions in force | compiled-in digest |

`core-api`, `public-api`, `webhook-sink` and `app-frontend` are **not** in it.
They matter at execution, which Phase C does not perform, and none of them
reports a build revision today — recording `unknown` for them is the silent
omission this change exists to prevent. Phase D extends the set when a runner
exercises them; the mechanism is already proven.

## 3. Fail-closed, through the state machine that already exists

Provenance is collected **in the preflight**, so an unresolvable component is a
check `FAIL` → verdict `UNHEALTHY` → run lands in `BLOCKED`. No new state was
invented.

`requireCompleteProvenance` then runs **inside the preparation transaction**, so
`READY ⇒ mandatory provenance complete` has no window: either the provenance
rows and the READY transition both commit, or neither does and the run stays
`PREPARING`. A placeholder is never accepted — not `""`, not `"unknown"`, and
never the repository's HEAD standing in for a deployed revision.

## 4. Runtime proof — `BZV-20260918-0002`

Prepared and cancelled by the human SUPER_ADMIN through the UI, with step-up.

```
run       BZV-20260918-0002 · GOLDEN v1 · SANDBOX · profile digest 955999c39bd918c6…
state     READY -> CANCELLED       started_at: NULL (never started)
history   1 (null)->PREPARING · 2 PREFLIGHT_RUNNING->READY · 3 READY->CANCELLED

provenance (4 rows, survived cancellation)
  admin-api            3befc997af07   BANZAMI_BUILD_COMMIT
  api-gateway          1bf03679d508   GET /health .build
  database-schema      0160           _sqlx_migrations
  validation-registry  76b58f64f59d…  compiled-in registry

measured (persisted, identical to the runtime preflight)
  budget/global_24h    used 1 070 120 · limit 50 000 000 · headroom 48 929 880 · ceiling 5 000 000
  budget/global_30d    used 92 988 840 · limit 400 000 000 · headroom 307 011 160
  budget/merchant_24h  headroom 25 000 000
  actors/resolve       checked 19
  registry/actors      provisioned 9
```

The gateway's pinned revision `1bf03679d508` **differs from the repository's
HEAD**. That is the proof the capture records the deployed revision and not the
source tree.

## 5. The pre-fix run is preserved exactly

`BZV-20260918-0001` still has **0 provenance rows** and **0 measurements**. It
was not backfilled, annotated or repaired. Its incompleteness is the historical
evidence that the defect was real, and reconstructing it from today's values
would destroy the only thing it is now good for.

## 6. Idempotent replay

`Prepare` now reports whether it **created** the run. A replay returns the run
the first call made, untouched — the handler no longer re-preflights it, which
would have mutated a settled run and, against a cancelled one, attempted an
illegal transition. That was the ambiguity the Phase C report recorded as
NOT PROVEN.

The UI's key remains time-derived (`GOLDEN-2026-09-18T13:53`), so two clicks a
minute apart still carry different keys and would produce two runs. The server
mechanism is correct; the weak key is recorded as open validation debt.

## 7. Final state

```
VALIDATION_RUN_COUNT_TOTAL   = 2      ACTIVE_VALIDATION_RUN_COUNT = 0
RUNS_EVER_STARTED            = 0      evidence rows               = 0
journeys executed            = 0      final preflight             = HEALTHY
```

Budget figures after both prepare/cancel cycles are byte-identical to before
them: 48 929 880 / 307 011 160 / 25 000 000 minor. Nothing was consumed, because
nothing ran.
