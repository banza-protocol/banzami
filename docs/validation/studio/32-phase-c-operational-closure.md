# 32 — Phase C operational closure

Version: 1.0
Status: Closed 2026-09-18. One Validation Run exists; it was never started.

This document records what happened **after** [30](30-operational-control-surface.md)
was written. It does not revise it. Doc 30 described a surface whose schema was
not yet applied, and that is what was true when it was written.

Chronology, preserved:

1. implementation complete (doc 30)
2. owner enablement pending (doc 30 §9)
3. owner ceremony completed (§3 below)
4. operational closure proven (§4–§8 below)

---

## 1. Ground truth before the ceremony

| Fact | Value |
|---|---|
| Repo HEAD | `030a064f`, clean, `== origin/main` |
| `admin-api` | `5c6b2ac6` · paridade ✓ |
| `admin-frontend` | `2e690c69` · paridade ✓ |
| `api-gateway-staging` | `1bf03679` · paridade ✓ |
| Sandbox migration head | **159** |
| 0160 applied? | **No** — `count(version=160)` = 0 |
| `validation_runs` | table **absent** (`to_regclass` IS NULL) |
| Nine actors | 9/9 HEALTHY |
| Preflight | `DEGRADED` — 7 PASS, `studio.schema` UNAVAILABLE |
| Start route / runner | none |

## 2. Pre-ceremony audit — one check failed, and that is why it ran

0160 contains 7 `CREATE TABLE IF NOT EXISTS`, 5 indexes, 2 functions, 2 triggers
and one `DO` block of grants. **No `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE`,
and no `ALTER` of any existing table.** The only pre-existing table it touches is
`admin_users`, and only as a foreign-key target.

Proven on a disposable database before the ceremony: 7 tables created, **0 rows
in every one**, `admin_users` unchanged. No `CONCURRENTLY` and no
non-transactional statement, so **partial application is impossible**.

Assumptions checked against the live Sandbox: `bl_admin_api_runtime` exists ·
`gen_random_uuid()` available (PostgreSQL 16.14) · zero name collisions ·
`admin_users.id` is `uuid`.

**The check that failed.** `sandbox-migration.sh apply` runs
`runtime-authority.sh apply` after *every* migration, and
`db/authority/runtime-authority.sql` is generated from the authority manifest —
**not** from the migration. 0160 granted its tables to `bl_admin_api_runtime`,
but the manifest did not know they existed, so the ceremony would have
regenerated the grants without them and the deployed Studio would have failed
with *permission denied*. This is the same class of failure that made the 0159
ceremony's runtime-authority step fail on its first attempt.

`node tools/db-authority.mjs` named all four written tables precisely. Fixed in
`8f3e3d39`; the ceremony was not run before that.

The regenerated authority grants `INSERT/UPDATE/DELETE` uniformly — wider than
0160's deliberate `SELECT`+`INSERT` on the append-only event table. Proven not to
matter, acting `AS bl_admin_api_runtime` while explicitly holding `DELETE`:

```
DELETE FROM validation_run_events  -> refused: "is append-only"
DELETE FROM validation_runs        -> refused: FK validation_run_events_run_id_fkey
UPDATE validation_run_events       -> refused: "is append-only"
```

Append-only is a trigger and a non-cascading foreign key, not a grant. A
privilege can be widened; the refusal cannot.

## 3. The owner ceremony

One sanctioned script,
[`validation-0160-owner-ceremony.sh`](../../../infra/blueprint/sandbox-ops/scripts/validation-0160-owner-ceremony.sh),
modelled directly on the one that applied 0159, using only
`sandbox-release-package.sh` + `sandbox-migration.sh`. No ad-hoc SQL, no
operator-DB-URL bypass, no hand-written authorisation record.

It proves the environment before touching anything (`current_database()` must be
`banzami_staging`) and is fail-closed at every step. Result:

```
release-manifest identity gate          GATE all_identities_match PASS
controlled migration                    authz_consumed_once PASS · receipt_consumed_once PASS
                                        migration_applied PASS · runtime_authority_applied PASS
single-use + rejection                  consumed/expired/wrong-revision/parent/executor/service-set
                                        all correctly REJECTED
advisory-lock concurrency               second_attempt_refused PASS
integrity + ownership                   12 checks PASS · VERIFY_IDENTITY_RESULT: PASS
short-lived login lifecycle             migration_login_removed PASS · credential_unusable PASS

post-checks   head 159 -> 160 · 7 tables · 2 triggers · 2 invariant indexes
              validation_runs rows = 0 · 7 tables granted to bl_admin_api_runtime

SANDBOX_0160_CEREMONY=DONE
```

The run-count post-check is the Phase C invariant: a migration that created a
run would be a migration that executed something.

**No service restart was needed.** Doc 30 expected this; the ceremony settled it.

## 4. Post-migration state, read independently

```
_sqlx_migrations   160 | validation runs | success t
tables 7 · triggers validation_run_events_no_change, validation_runs_legal_transition
indexes validation_runs_idempotency, validation_runs_one_active
environment CHECK  ((environment = 'SANDBOX'::text))
runs 0 · events 0 · preflights 0
nine actors 9/9 HEALTHY · registries unchanged
```

## 5. Preflight — DEGRADED to HEALTHY, for the one true reason

```
VERDICT: HEALTHY | meets HEALTHY minimum: True | persisted: False
  PASS registry digest            registry 76b58f64f59d… compiled into this build
  PASS registry actors            all 9 Validation Actors are provisioned
  PASS actors   resolve           19 actor product identities resolve
  PASS actors   operator_session  operator actor A01 is ACTIVE
  PASS budget   global_24h        48 929 880 minor of headroom
  PASS budget   global_30d        307 011 160 minor of headroom
  PASS budget   merchant_24h      tightest merchant actor is B01, 25 000 000 minor
  PASS studio   schema            the Validation Run schema is present
  PASS studio   no_active_run     no Validation Run is holding the Sandbox
```

The only check that changed is the only thing that changed.

## 6. RBAC evidence — A01 refused

Recorded in full in [31](31-authority-separation.md). Authenticated A01
(COMPLIANCE) attempted `POST /admin/v1/validation/runs` and received
**403 FORBIDDEN**; `validation_runs` and `validation_run_events` both remained
**0**. The capability middleware refused before the handler, so no run reference
was allocated and no preflight was persisted.

## 7. The prepared run

Prepared through the BANZADMIN UI by the human SUPER_ADMIN, with step-up.

| | |
|---|---|
| `id` | `5f84f51b-61c5-4b2e-944c-e440827c44ce` |
| `run_ref` | `BZV-20260918-0001` |
| environment / profile | `SANDBOX` · `GOLDEN` v1 |
| `profile_digest` | `955999c39bd918c6…` — matches the registry's GOLDEN digest |
| registry digest in force | `76b58f64f59d4430…` |
| requested_by | the human SUPER_ADMIN (**not** A01) |
| state on preparation | `READY` · `verdict null` · `started_at null` |
| preflight persisted | 1 × `HEALTHY`, 9 checks |

## 8. Cancellation

```
seq 1  (null)            -> PREPARING   "prepared"                          13:53:57.559
seq 2  PREFLIGHT_RUNNING -> READY       "preflight HEALTHY"                 13:53:57.569
seq 3  READY             -> CANCELLED   "cancelada pelo operador no BANZADMIN" 13:57:23.812
```

`started_at` is **still null** on a cancelled run: it was never started.

Final state, read from the database:

```
VALIDATION_RUN_COUNT_TOTAL   = 1      ACTIVE_VALIDATION_RUN_COUNT = 0
FIRST_RUN_STATE              = CANCELLED
runs that ever started       = 0      history entries             = 3
EVIDENCE rows                = 0      journeys executed           = 0
preflights retained          = 1      invariant triggers          = 2
```

Terminality, history immutability and undeletability are **not** re-tested
against the persistent Sandbox: the disposable harness
(`make check-validation-run-model`) proves all of them, and mutating real
evidence to re-demonstrate what is already proven would be the opposite of what
this programme is for.

## 9. Final preflight

`HEALTHY`, and the budget figures are **byte-identical** to the pre-run
preflight — 48 929 880 / 307 011 160 / 25 000 000 minor. Preparing and
cancelling a run consumed no quota, because nothing ran.

## 10. Three gaps found during closure — reported, not papered over

Found by reading what preparation actually persisted, rather than trusting that
the model implied the capture:

1. **Provenance is not captured.** `validation_run_provenance` has **0 rows**;
   `Prepare()` never writes it. The table exists, the write path does not.
   **This corrects doc 30 and the Phase C report, which recorded C.10 as PASS on
   the strength of the model existing. That was the model, not the capture.**
2. **The budget figures are not persisted.** The 9 checks store `status` and
   `detail`, but the `INSERT` omits `measured` — the headroom numbers reach the
   HTTP response and are then lost.
3. **The UI's idempotency key is time-derived** (`GOLDEN-2026-09-18T13:53`).
   The server mechanism is correct — the unique index on
   `(environment, idempotency_key)` is present on the deployed schema and proven
   by the disposable harness — but a second click a minute later would carry a
   *different* key and create a *second* run. The end-to-end API replay was
   therefore **not** performed: proving idempotency by creating a second run
   would have destroyed the property being closed.

None of the three was fixed before closure, deliberately: prepare and cancel are
proven over a single deployment (`5c6b2ac6`), which is what makes the sequence
coherent.
