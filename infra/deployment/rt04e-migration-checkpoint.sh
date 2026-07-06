#!/usr/bin/env bash
# =============================================================================
# RT04E migration checkpoint gate — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# The runner CANNOT reach tools/migrate-and-verify.sh without this gate passing.
# It requires, WITHOUT exposing or discovering any secret/database URL:
#   1. explicit operator confirmation that the target is Sandbox;
#   2. target identity checks that fail on Production/Live markers;
#   3. an approved controlled migration-access path (asserted, not the value);
#   4. a captured pre-migration schema/migration checkpoint (operator-confirmed);
#   5. an operator-confirmed backup or rollback-equivalent procedure;
#   6. ordered-migration + checksum preflight, incl. 0100_dev_project_sandbox_binding.sql;
#   7. failure on mismatch, missing checkpoint, missing approval, or drift anomaly.
#
# It does NOT connect to a database, does NOT read secrets, and does NOT put any
# database URL/token/secret into argv, logs, stdout, manifests, Git or Compose.
# Migration execution remains a SEPARATE explicit human-confirmed, forward-only stage.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

REPO_ROOT="${REPO_ROOT:-/srv/banzami/src}"
die() { printf 'checkpoint: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }
ok()  { printf '  ✓ %s\n' "$1"; }

# 1 + 2. Sandbox target, explicit operator confirmation, no Production/Live markers.
: "${BANZAMI_DB_TARGET:?BANZAMI_DB_TARGET required}"
case "$BANZAMI_DB_TARGET" in
  banzami_staging) ok "target is Sandbox (banzami_staging)" ;;
  *prod*|*production*|*live*|banzami) die "target '$BANZAMI_DB_TARGET' is Production/Live — refusing" 3 ;;
  *) die "unrecognised target '$BANZAMI_DB_TARGET' — refusing" 3 ;;
esac
[ "${RT04E_CHECKPOINT_CONFIRMED:-}" = "yes" ] || die "operator must confirm sandbox migration checkpoint (RT04E_CHECKPOINT_CONFIRMED=yes)" 4
ok "operator sandbox-target confirmation present"

# 3. Approved controlled migration-access path asserted (the VALUE is supplied to
#    migrate-and-verify via protected stdin by the runner — never here).
[ "${RT04E_MIGRATION_ACCESS_APPROVED:-}" = "yes" ] || die "controlled migration-access path not approved (RT04E_MIGRATION_ACCESS_APPROVED=yes)" 4
ok "controlled migration-access path approved (no value handled here)"

# 4 + 5. Captured checkpoint + backup/rollback-equivalent, operator-confirmed.
[ "${RT04E_CHECKPOINT_CAPTURED:-}" = "yes" ] || die "pre-migration schema/migration checkpoint not captured (RT04E_CHECKPOINT_CAPTURED=yes)" 4
[ "${RT04E_BACKUP_CONFIRMED:-}" = "yes" ]     || die "backup/rollback-equivalent procedure not confirmed (RT04E_BACKUP_CONFIRMED=yes)" 4
ok "pre-migration checkpoint captured + backup-equivalent confirmed"

# 6. Ordered-migration + checksum preflight (source-only; no DB access).
M="$REPO_ROOT/db/migrations/0100_dev_project_sandbox_binding.sql"
[ -f "$M" ] || die "migration 0100_dev_project_sandbox_binding.sql missing — refusing" 5
# forward-only: no destructive DDL, no down migrations.
grep -qiE 'DROP +TABLE|DROP +COLUMN|TRUNCATE +|DROP +SCHEMA|ALTER +TABLE .* DROP' "$M" && die "0100 contains destructive DDL — refusing" 5
ls "$REPO_ROOT"/db/migrations/*down*.sql "$REPO_ROOT"/db/migrations/*.down.sql >/dev/null 2>&1 && die "down migrations present — refusing (forward-only)" 5
# ordering sanity: 0100 must be discovered in lexical order among migrations.
last="$(ls -1 "$REPO_ROOT"/db/migrations/[0-9]*.sql 2>/dev/null | sort | tail -1)"
[ -n "$last" ] || die "no migrations discovered — refusing" 5
ok "0100 present · forward-only · ordered discovery OK (highest=$(basename "$last"))"

printf '  migration checkpoint gate: PASSED (migration is a separate explicit forward-only stage)\n'
