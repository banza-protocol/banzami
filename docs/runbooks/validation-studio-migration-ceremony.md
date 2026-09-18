# Runbook — Validation Studio migration ceremony (0160)

Applies `db/migrations/0160_validation_runs.sql`, the durable state the Banzami
Validation Studio's control plane needs. **Owner-gated.** Code, schema, RBAC,
tests and the BANZADMIN surface are done, on `main` and deployed; only the
controlled DB apply remains.

**No ad-hoc SQL. No operator-DB-URL bypass. No hand-written authorisation
record.** The only controlled path that migrates `banzami_staging` is
`infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh`, driven from a
verified release package — the same path that applied 0156–0159.

---

## 1. Why this is a ceremony and not a deploy

0160 creates tables, but what it really installs are four refusals the database
will make on everyone's behalf, forever:

| Invariant | Enforced by | What it refuses |
|---|---|---|
| Sandbox only | `CHECK (environment = 'SANDBOX')` | a Validation Run against Live cannot be *represented* |
| One active run | partial unique index | two runs spending the same rolling volume budget |
| Legal transitions only | `BEFORE UPDATE` trigger | `PREPARING → RUNNING`; reopening a terminal run |
| Append-only history | `BEFORE UPDATE OR DELETE` trigger + non-cascading FK | rewriting a transition; deleting a run |

Each is mutation-proven on a disposable database by
`make check-validation-run-model`, which tries to break all four and requires
each refusal to name the right reason.

## 2. Current state (read-only, verified)

| Fact | Value |
|---|---|
| Sandbox `_sqlx_migrations` head | **159** (`collections idempotency`, success) |
| Repository head migration | **0160_validation_runs.sql** |
| `migration_directory_digest` | `e547ad73f8ccdada3f14184f07208950e5140ef8667ec0c3709095bc2d160493` |
| `source_revision` to build from | `5c6b2ac6b40551b5f222ed672ea4dcc2e13fa023` (or any later clean HEAD containing 0160) |
| `target` | `banzami_staging` (in `bzsandbox-*-postgres-1`) |
| admin-api deployed | Validation Studio live; `durable: true`; 0160 absent |

The deployed control plane already reports this correctly rather than hiding it:

```
GET /admin/v1/validation/preflight?profile=GOLDEN
  VERDICT: DEGRADED   meets HEALTHY minimum: false   persisted: false
  PASS         registry  actors            all 9 Validation Actors are provisioned
  PASS         actors    resolve           19 actor product identities resolve
  PASS         actors    operator_session  operator actor A01 is ACTIVE
  PASS         budget    global_24h        48 929 880 minor of headroom
  UNAVAILABLE  studio    schema            migration 0160 is not present
```

A GOLDEN run is refused, for the true reason, with nothing written. That is the
system behaving correctly while incomplete — not a failure to be worked around.

## 3. Pre-ceremony audit (done; recorded here because one check failed)

Every assumption 0160 makes was verified against the live Sandbox before this
runbook was handed over:

| Assumption | Verified |
|---|---|
| head is 159, 0160 absent | ✓ `_sqlx_migrations` max 159; `count(version=160)` = 0 |
| no name collision | ✓ 0 existing `validation%` tables and functions |
| `admin_users.id` is `uuid` | ✓ |
| `gen_random_uuid()` available | ✓ PostgreSQL 16.14 |
| role `bl_admin_api_runtime` exists | ✓ — otherwise 0160's grant block silently skips |
| fully transactional | ✓ no `CONCURRENTLY`, no non-transactional statement, no `no-transaction` marker → **partial application is impossible** |
| creates no rows | ✓ applied to a disposable database: 7 tables, **0 rows in every one**, `admin_users` untouched |
| **runtime grants** | ✗ **FAILED, and was fixed** — see below |

**The failed check.** `sandbox-migration.sh apply` runs `runtime-authority.sh
apply` after *every* migration, and `db/authority/runtime-authority.sql` is
generated from `db/authority/runtime-authority.json` — **not** from the
migration. 0160 granted its tables to `bl_admin_api_runtime`, but the authority
manifest did not know they existed, so the ceremony would have regenerated the
grants without them and the deployed Studio would have failed with *permission
denied*. This is the same class of failure that made the 0159 ceremony's
runtime-authority step fail on its first attempt.

`node tools/db-authority.mjs` named all four written tables precisely. The
manifest now carries all seven, and the check passes
(`DB_AUTHORITY_MANIFEST=PASS`). **Do not run this ceremony from a revision
before that fix.**

The regenerated authority grants `INSERT/UPDATE/DELETE` uniformly, which is
wider than 0160's deliberate `SELECT`+`INSERT` on the append-only event table.
That does not weaken anything, and it is proven rather than assumed — acting
`AS bl_admin_api_runtime` while explicitly holding `DELETE`:

```
DELETE FROM validation_run_events  -> refused: "is append-only"
DELETE FROM validation_runs        -> refused: FK validation_run_events_run_id_fkey
UPDATE validation_run_events       -> refused: "is append-only"
```

Append-only is a trigger and a non-cascading foreign key, not a grant. A
privilege can be widened; the refusal cannot.

## 4. SANDBOX ceremony (owner-executed, one command)

The ceremony is a single sanctioned script, modelled directly on the one that
applied 0159. It uses **only** the sanctioned controller
(`sandbox-release-package.sh` + `sandbox-migration.sh`): no ad-hoc SQL, no
operator-DB-URL bypass, no hand-written authz record. It deploys nothing.

```bash
ssh -t root@<sandbox-host> \
  'cd /srv/banzami/src && git fetch origin && git checkout origin/main && \
   bash infra/blueprint/sandbox-ops/scripts/validation-0160-owner-ceremony.sh'
```

`origin/main` is correct as long as it contains the authority-manifest fix in
§3 — it has since `8f3e3d39`. The script binds the release package to whatever
clean HEAD it finds and refuses a dirty worktree, so pinning a specific SHA is
optional; what is not optional is that the revision post-dates that fix.

A TTY (`ssh -t`) is required: Sandbox migrations run in an operator context, and
bypassing that with `psql` is what caused the 0090–0095 drift.

What the script does, in order, aborting on any failure:

1. resolves `TMPDIR` to the base that actually holds the bootstrap state
   (`/opt/banzami-blueprint/tmp`, **not** `/tmp`) and refuses to continue if it
   cannot find it — it must never re-bootstrap, which would wipe the PG volume;
2. asserts a clean worktree;
3. **proves the environment**: `current_database()` must be `banzami_staging`;
4. fail-closed pre-check: head `159` with `validation_runs` absent (fresh), or
   head `160` with it present (resume after a partial runtime-authority step);
5. builds and verifies the secret-free release package;
6. `sandbox-migration.sh plan` → `apply` → `verify`;
7. post-checks, each fail-closed: head `160` · 7 Studio tables · both invariant
   triggers · both invariant indexes · **`count(*) FROM validation_runs` = 0** ·
   all 7 tables granted to `bl_admin_api_runtime`;
8. single-use cleanup of the ceremony material.

Step 7's run-count check is the Phase C invariant: a migration that created a
run would be a migration that executed something, and that is the one thing it
must never do.

**Service restart.** None is expected — admin-api holds no cached schema handle
and its pool prepares per query. This is *expected, not asserted*: the
post-ceremony check in §5 is what settles it. If the Studio still reports
`studio.schema UNAVAILABLE` after the ceremony, restart `admin-api` and re-check;
that is a normal container restart, not a deploy.

Fail-closed throughout. On any partial failure, stop — do not continue, and do
not hand-apply.

## 5. After the ceremony

```
GET /admin/v1/validation/preflight?profile=GOLDEN   → expect studio.schema PASS,
                                                      studio.no_active_run PASS,
                                                      verdict HEALTHY
GET /admin/v1/validation/overview                  → expect 200, runs: []
```

The Studio is then able to prepare a run. **It still cannot start one** —
`make check-validation-no-start` asserts that no non-test code path writes
`QUEUED`, and there is no route that would. Starting a GOLDEN or FULL run is a
separate, explicitly authorised decision.

## 6. LIVE

**Not applicable, permanently.** 0160 admits one environment and it is not Live:

```sql
environment TEXT NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX')
```

Applying 0160 to the Live database would create tables no row could ever be
written to. There is no Live ceremony for this migration and there will not be
one. `REAL_LIVE_TESTS_EXECUTED=0` is a schema property, not a policy.
