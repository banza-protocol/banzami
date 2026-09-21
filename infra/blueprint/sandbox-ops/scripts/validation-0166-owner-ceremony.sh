#!/usr/bin/env bash
# Banzami — owner ceremony for migration 0166 (SANDBOX only).
#
# 0166 grants the control plane the ONE read it needs to gate on workspace
# capacity: USAGE on schema developer and SELECT on developer.dev_workspaces,
# to bl_admin_api_runtime.
#
# It uses ONLY the sanctioned controller (sandbox-release-package.sh +
# sandbox-migration.sh), exactly as the 0159 and 0160 ceremonies did. No ad-hoc
# SQL, no operator-DB-URL bypass, no hand-written authz record. It deploys
# nothing and it starts nothing.
#
# Fail-closed: set -euo pipefail + an explicit pre-head guard + each script's own
# gates + post-checks that refuse anything WIDER than what was asked for.
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

q() { docker exec "$PG" sh -c "PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"$1\""; }

echo "== environment proof (SANDBOX only) =="
echo "  database=$(q "SELECT current_database()")"
echo "  container=$PG"
[ "$(q "SELECT current_database()")" = "banzami_staging" ] || { echo "ABORT: not banzami_staging"; exit 1; }

echo "== read-only pre-check (fail closed unless head == 165 or 166) =="
H="$(q "SELECT max(version) FROM _sqlx_migrations")"
G="$(q "SELECT has_table_privilege('bl_admin_api_runtime','developer.dev_workspaces','SELECT')")"
echo "  pre-head=$H  admin-api can SELECT dev_workspaces=$G"
if [ "$H" = "165" ] && [ "$G" = "f" ]; then
  echo "  state=fresh (0166 not yet applied)"
elif [ "$H" = "166" ] && [ "$G" = "t" ]; then
  echo "  state=already applied (migrate will be a no-op; post-checks still run)"
else
  echo "ABORT: unexpected state (head=$H select=$G); expected 165/f or 166/t"; exit 1
fi

# A migration must never execute anything. Recorded BEFORE, compared AFTER.
RUNS_BEFORE="$(q "SELECT count(*) FROM validation_runs")"
echo "  validation_runs before=$RUNS_BEFORE"

echo "== release package =="
bash "$S/sandbox-release-package.sh" build
bash "$S/sandbox-release-package.sh" verify

echo "== migration =="
bash "$S/sandbox-migration.sh" plan
bash "$S/sandbox-migration.sh" apply
bash "$S/sandbox-migration.sh" verify

echo "== post-checks (each fail-closed) =="
H2="$(q "SELECT max(version) FROM _sqlx_migrations")"
echo "  head=$H2"
[ "$H2" = "166" ] || { echo "ABORT: head is $H2, expected 166"; exit 1; }

U="$(q "SELECT has_schema_privilege('bl_admin_api_runtime','developer','USAGE')")"
echo "  USAGE on schema developer=$U"
[ "$U" = "t" ] || { echo "ABORT: no USAGE on schema developer"; exit 1; }

S1="$(q "SELECT has_table_privilege('bl_admin_api_runtime','developer.dev_workspaces','SELECT')")"
echo "  SELECT on developer.dev_workspaces=$S1"
[ "$S1" = "t" ] || { echo "ABORT: no SELECT on developer.dev_workspaces"; exit 1; }

# The grant must not have been WIDER than it was asked to be. A read gate that
# quietly acquired write authority over the Developer domain would be a worse
# outcome than the gate not existing.
for P in INSERT UPDATE DELETE TRUNCATE; do
  W="$(q "SELECT has_table_privilege('bl_admin_api_runtime','developer.dev_workspaces','$P')")"
  echo "  $P on developer.dev_workspaces=$W"
  [ "$W" = "f" ] || { echo "ABORT: control plane acquired $P on dev_workspaces"; exit 1; }
done

N="$(q "SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants WHERE grantee='bl_admin_api_runtime' AND table_schema='developer'")"
echo "  tables granted in schema developer=$N"
[ "$N" = "1" ] || { echo "ABORT: expected exactly 1 granted table in schema developer, found $N"; exit 1; }

RUNS_AFTER="$(q "SELECT count(*) FROM validation_runs")"
echo "  validation_runs after=$RUNS_AFTER"
[ "$RUNS_AFTER" = "$RUNS_BEFORE" ] || {
  echo "ABORT: the migration changed the run count ($RUNS_BEFORE -> $RUNS_AFTER); a migration must execute nothing"; exit 1; }

echo "== cleanup =="
bash "$S/sandbox-migration.sh" clean

echo
echo "VALIDATION_0166_CEREMONY: OK (head 166 · SELECT-only on developer.dev_workspaces · no write authority)"
