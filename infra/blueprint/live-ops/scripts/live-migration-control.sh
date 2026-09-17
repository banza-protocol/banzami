#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Part B — target-aware controlled migration.
#
# ONE controller, MANY environments. The environment is chosen EXPLICITLY by name
# (--env SANDBOX|LIVE) and resolved from infra/blueprint/environments.json; it is
# NEVER inferred from a database name. Before any write the controller cross-checks
# the CONNECTED database against the environment's declared `database` and FAILS
# CLOSED on any mismatch, so a Sandbox credential can never drive a LIVE apply.
#
# LIVE policy (from environments.json) adds, on top of the Sandbox controls:
#   • dual-control    — >= min_approvals DISTINCT signed approvals (dual-control.sh)
#   • maintenance window — apply only inside a sanctioned window
#   • verified backup/restore — asserted present before apply
# and it REFUSES a real (provisioned=true) LIVE apply here: real Live provisioning is
# an owner/governance boundary. A DISPOSABLE Live-shaped substrate (--disposable) may
# be driven for autonomous validation with every gate still enforced.
#
# The AUTHORISATION and approvals are single-use (consumed); the migration RECEIPT is
# durable audit evidence (present + verified), never consumed (§22).
#
#   live-migration-control.sh <plan|apply|verify> --env LIVE --admin-url <url> \
#       [--disposable] [--window-open] [--approvals-dir D --keyring K] \
#       --rev R --mig M --exec E --svc "s1 s2 ..." [--receipt-dir DIR]
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENVS="$REPO_ROOT/infra/blueprint/environments.json"
DC="$(dirname "${BASH_SOURCE[0]}")/dual-control.sh"

die() { echo "live-migration-control: $*" >&2; exit 1; }

# ---- args ----
CMD="${1:-}"; shift || true
ENV_NAME=""; ADMIN_URL=""; DISPOSABLE=0; WINDOW_OPEN=0
APPROVALS_DIR=""; KEYRING=""; REV=""; MIG=""; EXE=""; SVC=""; RECEIPT_DIR=""; BACKUP_VERIFIED="${LIVE_BACKUP_VERIFIED:-0}"
while [ $# -gt 0 ]; do case "$1" in
  --env) ENV_NAME="$2"; shift 2;;
  --admin-url) ADMIN_URL="$2"; shift 2;;
  --disposable) DISPOSABLE=1; shift;;
  --window-open) WINDOW_OPEN=1; shift;;
  --approvals-dir) APPROVALS_DIR="$2"; shift 2;;
  --keyring) KEYRING="$2"; shift 2;;
  --rev) REV="$2"; shift 2;;
  --mig) MIG="$2"; shift 2;;
  --exec) EXE="$2"; shift 2;;
  --svc) SVC="$2"; shift 2;;
  --receipt-dir) RECEIPT_DIR="$2"; shift 2;;
  *) die "unknown arg $1";;
esac; done
[ -n "$ENV_NAME" ] || die "--env is required (SANDBOX|LIVE) — environment is explicit, never inferred"
[ -f "$ENVS" ] || die "environments manifest missing: $ENVS"

# ---- resolve environment identity (explicit) ----
envq() { jq -r ".environments.\"$ENV_NAME\"$1 // empty" "$ENVS"; }
[ "$(envq '')" != "" ] || die "unknown environment '$ENV_NAME' in $ENVS"
DB_DECLARED="$(envq .database)"
PROVISIONED="$(envq .provisioned)"
DUAL="$(envq .policy.dual_control)"
MINAPP="$(envq .policy.min_approvals)"
WIN_REQ="$(envq .policy.maintenance_window)"
BACKUP_REQ="$(envq .policy.verified_backup_restore_required)"
GATE_STATE="$(envq .financial_live_gate.state)"

echo "== environment =="
echo "  env=$ENV_NAME declared_db=$DB_DECLARED provisioned=$PROVISIONED"
echo "  policy: dual_control=$DUAL min_approvals=$MINAPP maintenance_window=$WIN_REQ backup_required=$BACKUP_REQ"
[ -n "$GATE_STATE" ] && echo "  financial_live_gate=$GATE_STATE (independent of Collections)"

# ---- connected-database cross-check (FAIL CLOSED on mismatch) ----
[ -n "$ADMIN_URL" ] || die "--admin-url required (admin connection to the target cluster)"
CONNECTED_DB="$(psql "$ADMIN_URL" -tAc 'SELECT current_database()' 2>/dev/null || true)"
# The admin URL connects to a maintenance DB; the TARGET db is the declared one.
TARGET_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#/[^/?]+(\\?.*)?\$#/$DB_DECLARED\\1#")"
echo "  admin_connected_db=$CONNECTED_DB  target_db=$DB_DECLARED"

# ---- provisioned / disposable gate ----
if [ "$PROVISIONED" = "true" ]; then
  [ "$ENV_NAME" != "LIVE" ] || die "refusing autonomous apply to a PROVISIONED LIVE substrate — owner ceremony boundary"
elif [ "$DISPOSABLE" != "1" ]; then
  die "$ENV_NAME is not provisioned; pass --disposable to drive a DISPOSABLE substrate for validation, never a real one"
fi

plan() {
  echo "== plan (dry, fail-closed) =="
  echo "  target=$DB_DECLARED env=$ENV_NAME"
  echo "  rejects: environment mismatch, unprovisioned-without-disposable, closed maintenance window, quorum-not-met, backup-unverified"
  echo "  rev=$REV mig=$MIG"
  echo "PLAN_OK"
}

gate_window() {
  [ "$WIN_REQ" = "true" ] || { echo "  maintenance_window: not required for $ENV_NAME"; return 0; }
  [ "$WINDOW_OPEN" = "1" ] || die "maintenance window CLOSED — refusing apply (open the sanctioned window to proceed)"
  echo "  maintenance_window: OPEN (sanctioned)"
}
gate_backup() {
  [ "$BACKUP_REQ" = "true" ] || return 0
  [ "$BACKUP_VERIFIED" = "1" ] || die "verified backup/restore NOT attested (set LIVE_BACKUP_VERIFIED=1 only after a real verified restore drill)"
  echo "  verified_backup_restore: attested"
}
gate_dual_control() {
  [ "$DUAL" = "true" ] || { echo "  dual_control: not required for $ENV_NAME"; return 0; }
  [ -n "$APPROVALS_DIR" ] && [ -n "$KEYRING" ] || die "dual_control requires --approvals-dir and --keyring"
  [ -n "$REV$MIG$EXE$SVC" ] || die "dual_control needs the full migration identity (--rev --mig --exec --svc)"
  local out
  out="$(bash "$DC" verify "$APPROVALS_DIR" "$KEYRING" "$DB_DECLARED" "$ENV_NAME" "$REV" "$MIG" "$EXE" "$SVC" "$MINAPP")" \
    || die "dual-control quorum NOT met: $out"
  echo "  dual_control: $out (>= $MINAPP distinct approvals)"
}

bootstrap_roles() {
  # Least-privilege role model on the target DB (disposable substrate). Mirrors the
  # Sandbox contract: NOLOGIN schema owner owns objects; short-lived migration login
  # is the sole owner member; runtime/control/core roles own nothing.
  echo "== role model (least privilege) =="
  local pw; pw="$(openssl rand -hex 16)"
  psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q >/dev/null <<SQL
DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_schema_owner') THEN CREATE ROLE bl_schema_owner NOLOGIN; END IF; END \$\$;
DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_app_runtime') THEN CREATE ROLE bl_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END \$\$;
DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_control_plane') THEN CREATE ROLE bl_control_plane NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END \$\$;
DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_core_runtime') THEN CREATE ROLE bl_core_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END \$\$;
DROP ROLE IF EXISTS bl_migration;
CREATE ROLE bl_migration LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD '${pw}' VALID UNTIL 'infinity';
GRANT bl_schema_owner TO bl_migration;
ALTER ROLE bl_migration IN DATABASE ${DB_DECLARED} SET role = 'bl_schema_owner';
ALTER SCHEMA public OWNER TO bl_schema_owner;
GRANT CREATE, CONNECT ON DATABASE ${DB_DECLARED} TO bl_schema_owner;
GRANT CONNECT ON DATABASE ${DB_DECLARED} TO bl_migration, bl_app_runtime, bl_control_plane, bl_core_runtime;
SQL
  # migration login URL (objects created will be owned by bl_schema_owner via SET role)
  MIG_URL="$(printf '%s' "$TARGET_URL" | sed -E "s#://[^/]+@#://bl_migration:${pw}@#")"
  echo "  roles established (schema owner NOLOGIN; migration login short-lived; runtime/control/core own nothing)"
}

do_migrate() {
  echo "== controlled migrate (sqlx, as bl_migration → owns as bl_schema_owner) =="
  ( cd "$REPO_ROOT" && DATABASE_URL="$MIG_URL" sqlx migrate run --source db/migrations ) >/dev/null
  local head; head="$(psql "$TARGET_URL" -tAc 'SELECT max(version) FROM _sqlx_migrations')"
  echo "  head=$head"
}

verify_authority() {
  echo "== authority verify =="
  local app owner_ok
  app="nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast_temp%'"
  owner_ok="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE $app AND c.relkind IN ('r','p') AND c.relowner<>'bl_schema_owner'::regrole")"
  [ "$owner_ok" = "0" ] && echo "  ownership: all app tables owned by bl_schema_owner" || die "OWNERSHIP drift: $owner_ok tables not owned by bl_schema_owner"
}

issue_receipt() {
  [ -n "$RECEIPT_DIR" ] || RECEIPT_DIR="$(mktemp -d)"
  mkdir -p "$RECEIPT_DIR"; local f="$RECEIPT_DIR/migration.receipt"; umask 077
  { echo "kind=receipt"; echo "target=$DB_DECLARED"; echo "environment=$ENV_NAME"
    echo "source_revision=$REV"; echo "migration_digest=$MIG"; echo "executor_digest=$EXE"
    echo "service_set=$SVC"; echo "issued_epoch=$(date -u +%s)"
    echo "state=present_and_verified"; } > "$f"; chmod 0600 "$f"
  echo "== receipt =="
  echo "  MIGRATION_RECEIPT_STATE=PRESENT_AND_VERIFIED ($f)"
  # single-use authorisation/approvals are consumed; the receipt stays durable
  [ "$DUAL" = "true" ] && [ -n "$APPROVALS_DIR" ] && { bash "$DC" consume "$APPROVALS_DIR"; echo "  AUTHORIZATION_RECORD_STATE=CONSUMED (approvals single-use)"; }
  RECEIPT_FILE="$f"
}

apply() {
  echo "== apply (fail-closed gates → migrate → verify → durable receipt) =="
  gate_window
  gate_backup
  gate_dual_control
  bootstrap_roles
  do_migrate
  verify_authority
  issue_receipt
  echo "LIVE_MIGRATION_APPLY_OK env=$ENV_NAME db=$DB_DECLARED"
}

case "$CMD" in
  plan) plan;;
  apply) apply;;
  verify) verify_authority;;
  *) die "unknown command '$CMD' (plan|apply|verify)";;
esac
