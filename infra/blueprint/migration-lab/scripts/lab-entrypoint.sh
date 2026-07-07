#!/usr/bin/env bash
# =============================================================================
# Banzami Increment 2C — lab-only migration entrypoint (EMBEDDED in derived image).
# =============================================================================
# LOCAL/DISPOSABLE ONLY. This is NOT the production/Sandbox RT04E entrypoint.
#
# The database credential is read EXCLUSIVELY from a read-only mounted file and set
# only into the private sqlx subprocess — never via env passed to the container,
# argv, image metadata, Docker config or logs. The target MUST be the disposable
# local database; banzami_staging/live/prod markers are refused. Applies ONLY the
# canonical migrations EMBEDDED in this image (no runtime source mount), except in
# the explicit drift mode which runs a mounted temporary workspace expecting SQLx to
# REJECT it on checksum mismatch.
set -euo pipefail
set +x
umask 077

SECRET_FILE="/run/secrets/rt04e_migration_url"     # FIXED — never caller-supplied
EMBEDDED="/work/db/migrations"                      # embedded canonical set
MODE="${1:-run}"
DRIFT_SRC="${2:-/drift/migrations}"
die() { printf 'migration-lab-runner: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

# credential must never arrive via env/argv
[ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be provided via environment — read-only file only" 2
[ -e "$SECRET_FILE" ] || die "secret file not mounted (read-only) — refusing" 3
[ ! -L "$SECRET_FILE" ] || die "secret file is a symlink — refusing" 3
[ -f "$SECRET_FILE" ] || die "secret file is not a regular file — refusing" 3

_url="$(cat "$SECRET_FILE")"
_clear() { _url=''; unset _url 2>/dev/null || true; }
trap '_clear' EXIT INT TERM HUP
[ -n "$_url" ] || { _clear; die "secret file empty — refusing" 3; }

# target-label validation WITHOUT rendering the URL
_tail="${_url##*/}"; _db="${_tail%%\?*}"
[ "$_db" = blueprint_migration_lab ] || { _clear; die "credential does not target blueprint_migration_lab — refusing" 3; }
case "$_url" in
  *banzami_staging*|*banzami_live*|*prod*|*production*|*live*) _clear; die "forbidden target marker — refusing" 3;;
esac

case "$MODE" in
  run)
    # apply ONLY the embedded canonical migrations
    ( DATABASE_URL="$_url" sqlx migrate run --source "$EMBEDDED" ) >/dev/null 2>&1 \
      || { _clear; die "forward-only migration failed" 7; }
    printf '  migration-lab-runner: embedded canonical migrations applied (sanitised)\n'
    ;;
  run-drift)
    # controlled drift probe: a modified temporary workspace MUST be rejected on checksum
    if ( DATABASE_URL="$_url" sqlx migrate run --source "$DRIFT_SRC" ) >/dev/null 2>&1; then
      _clear; die "DRIFT NOT DETECTED — modified migration workspace was accepted" 8
    fi
    printf '  migration-lab-runner: drift workspace correctly REJECTED (sanitised)\n'
    ;;
  *) _clear; die "unknown lab mode" 2 ;;
esac
_clear
