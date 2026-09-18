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

## 3. SANDBOX ceremony (owner-executed, on the Sandbox host)

> Preconditions the owner confirms: the existing `bzsandbox` project's blueprint
> state files are present from the original bootstrap. **Do NOT run
> `sandbox-bootstrap.sh apply`** — it is create-only and its teardown wipes the
> PG volume. Realign the operator db_url after any role bootstrap (known gotcha).

```bash
set -euo pipefail
cd <repo-on-sandbox-host>
git fetch origin && git checkout 5c6b2ac6b40551b5f222ed672ea4dcc2e13fa023
test -z "$(git status --porcelain)"        # clean worktree (build requires it)
S=infra/blueprint/sandbox-ops/scripts

# 1. Verified, secret-free release package from HEAD.
bash $S/sandbox-release-package.sh build
bash $S/sandbox-release-package.sh verify

# 2. Controlled migration. plan is a dry, fail-closed gate — inspect it first.
bash $S/sandbox-migration.sh plan
bash $S/sandbox-migration.sh apply         # 159 -> 160
bash $S/sandbox-migration.sh verify

# 3. Read-only enablement checks (fail closed if any is wrong).
PG="$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1')"
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"'   # expect 160
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT to_regclass('"'"'public.validation_runs'"'"'), to_regclass('"'"'public.validation_run_events'"'"'), to_regclass('"'"'public.validation_preflights'"'"')"'

# 4. Single-use cleanup of ceremony state.
bash $S/sandbox-migration.sh clean
```

**No service restart is required.** admin-api opens its pool lazily per query
and holds no cached schema handle; the Studio starts answering the moment the
tables exist.

Fail-closed: every step aborts the ceremony. On any partial failure, stop — do
not continue, and do not hand-apply.

## 4. After the ceremony

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

## 5. LIVE

**Not applicable, permanently.** 0160 admits one environment and it is not Live:

```sql
environment TEXT NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX')
```

Applying 0160 to the Live database would create tables no row could ever be
written to. There is no Live ceremony for this migration and there will not be
one. `REAL_LIVE_TESTS_EXECUTED=0` is a schema property, not a policy.
