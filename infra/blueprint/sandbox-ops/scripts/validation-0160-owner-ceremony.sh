#!/usr/bin/env bash
# BANZAMI-SANDBOX-FULL-VALIDATION-001 — Sandbox migration 0159 -> 0160
# (Banzami Validation Studio run domain model). ONE sanctioned owner ceremony.
# Run it ON the sandbox host with a TTY:
#
#     ssh -t root@<sandbox-host> \
#       'bash /srv/banzami/src/infra/blueprint/sandbox-ops/scripts/validation-0160-owner-ceremony.sh'
#
# It uses ONLY the sanctioned controller (sandbox-release-package.sh +
# sandbox-migration.sh), exactly as the 0159 ceremony did. No ad-hoc SQL, no
# operator-DB-URL bypass, no hand-written authz/receipt. It deploys nothing.
#
# 0160 creates seven tables and nothing else: no INSERT, no UPDATE, no DELETE,
# no ALTER of any existing table. It cannot create a Validation Run, and the
# post-check below fails closed if one appears.
#
# Fail-closed: set -euo pipefail + an explicit pre-head guard + each script's own
# die/hold on revision/digest/target/authz/executor/lock/head/drift/receipt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"
S=infra/blueprint/sandbox-ops/scripts

# The original bootstrap persisted its state under a NON-default TMPDIR
# (/opt/banzami-blueprint/tmp), not /tmp. The controller resolves the existing
# bzsandbox project's state from $TMPDIR/banzami-blueprint-sandbox/current.run, so
# point it at the base that actually holds the state — and NEVER re-bootstrap (that
# wipes the PG volume).
if [ -z "${TMPDIR:-}" ] || [ ! -f "${TMPDIR%/}/banzami-blueprint-sandbox/current.run" ]; then
  for base in /opt/banzami-blueprint/tmp /tmp; do
    if [ -f "$base/banzami-blueprint-sandbox/current.run" ]; then export TMPDIR="$base"; break; fi
  done
fi
[ -f "${TMPDIR:-/tmp}/banzami-blueprint-sandbox/current.run" ] || {
  echo "ABORT: bootstrap state (current.run) not found under any known TMPDIR base."
  echo "       Do NOT run sandbox-bootstrap apply (it wipes the PG volume)."
  exit 1; }
echo "== state base =="
echo "  TMPDIR=$TMPDIR"

echo "== repo =="
echo "  root=$REPO_ROOT"
echo "  HEAD=$(git rev-parse HEAD)"
[ -z "$(git status --porcelain)" ] || { echo "ABORT: worktree not clean (release build requires it)"; exit 1; }

PG="$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1')"
[ -n "$PG" ] || { echo "ABORT: sandbox postgres container not found"; exit 1; }

# Every read below is against banzami_staging. The environment proof is explicit
# and immediately before the apply: this ceremony has no Live form, because 0160
# admits no environment but SANDBOX.
q() { docker exec "$PG" sh -c "PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"$1\""; }

echo "== environment proof (SANDBOX only) =="
echo "  database=$(q "SELECT current_database()")"
echo "  container=$PG"
[ "$(q "SELECT current_database()")" = "banzami_staging" ] || { echo "ABORT: not banzami_staging"; exit 1; }

echo "== read-only pre-check (fail closed unless head == 159) =="
H="$(q "SELECT max(version) FROM _sqlx_migrations")"
T="$(q "SELECT coalesce(to_regclass('public.validation_runs')::text,'')")"
echo "  pre-head=$H  validation_runs=[$T]"
if [ "$H" = "159" ] && [ -z "$T" ]; then
  echo "  state=fresh (0160 not yet applied)"
elif [ "$H" = "160" ] && [ "$T" = "validation_runs" ]; then
  echo "  state=resume (0160 applied; completing runtime authority — migrate will be a no-op)"
else
  echo "ABORT: unexpected state (head=$H validation_runs=[$T]); expected 159/absent or 160/present"; exit 1
fi

echo "== 1-2. verified, secret-free release package from clean HEAD =="
bash "$S/sandbox-release-package.sh" build
bash "$S/sandbox-release-package.sh" verify

echo "== 3-5. controlled migration 159 -> 160 (plan -> apply -> governed verify) =="
bash "$S/sandbox-migration.sh" plan
bash "$S/sandbox-migration.sh" apply
bash "$S/sandbox-migration.sh" verify

echo "== 6. post-checks (read-only) =="
H2="$(q "SELECT max(version) FROM _sqlx_migrations")"
echo "  post-head=$H2 (expect 160)"
[ "$H2" = "160" ] || { echo "ABORT: post-head $H2 != 160"; exit 1; }

OK="$(q "SELECT count(*) FROM pg_tables WHERE tablename LIKE 'validation%'")"
echo "  validation tables=$OK (expect 7)"
[ "$OK" = "7" ] || { echo "ABORT: expected 7 Studio tables, found $OK"; exit 1; }

TRG="$(q "SELECT count(*) FROM pg_trigger WHERE tgname IN ('validation_runs_legal_transition','validation_run_events_no_change')")"
echo "  invariant triggers=$TRG (expect 2)"
[ "$TRG" = "2" ] || { echo "ABORT: the state-machine / append-only triggers are not both present"; exit 1; }

IDX="$(q "SELECT count(*) FROM pg_indexes WHERE indexname IN ('validation_runs_one_active','validation_runs_idempotency')")"
echo "  invariant indexes=$IDX (expect 2)"
[ "$IDX" = "2" ] || { echo "ABORT: the one-active-run / idempotency indexes are not both present"; exit 1; }

# The Phase C invariant. A migration that created a run would be a migration
# that executed something, and that is the one thing this must never do.
RUNS="$(q "SELECT count(*) FROM validation_runs")"
echo "  validation_runs rows=$RUNS (expect 0)"
[ "$RUNS" = "0" ] || { echo "ABORT: the migration created $RUNS Validation Run(s); it must create none"; exit 1; }

GRANTS="$(q "SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants WHERE grantee='bl_admin_api_runtime' AND table_name LIKE 'validation%'")"
echo "  tables granted to bl_admin_api_runtime=$GRANTS (expect 7)"
[ "$GRANTS" = "7" ] || { echo "ABORT: runtime grants incomplete ($GRANTS/7) — the Studio would fail permission denied"; exit 1; }

echo "== 7. single-use cleanup of ceremony material =="
bash "$S/sandbox-migration.sh" clean

echo
echo "SANDBOX_0160_CEREMONY=DONE  (head 159 -> 160, 7 tables, 2 triggers, 2 invariant indexes,"
echo "                             0 Validation Runs, runtime grants complete, receipt consumed)"
echo "NEXT (Claude, not blocked): read-only preflight -> prepare ONE GOLDEN run -> cancel it."
echo "                            No GOLDEN or FULL scenario is executed."
