#!/usr/bin/env bash
# Banzami Increment 2D — lab-only migration entrypoint (EMBEDDED in derived image).
# LOCAL/DISPOSABLE ONLY. NOT the production/Sandbox RT04E entrypoint.
# The DB credential is read ONLY from a read-only mounted file and set only into the
# private sqlx subprocess. Target MUST be the disposable local database. Applies ONLY
# the canonical migrations EMBEDDED in this image (no runtime source mount).
set -euo pipefail
set +x
umask 077
SECRET_FILE="/run/secrets/rt04e_migration_url"
EMBEDDED="/work/db/migrations"
die() { printf 'migration-identity-runner: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }
[ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be provided via environment — read-only file only" 2
[ -e "$SECRET_FILE" ] || die "secret file not mounted (read-only) — refusing" 3
[ ! -L "$SECRET_FILE" ] || die "secret file is a symlink — refusing" 3
[ -f "$SECRET_FILE" ] || die "secret file is not a regular file — refusing" 3
_url="$(cat "$SECRET_FILE")"
_clear() { _url=''; unset _url 2>/dev/null || true; }
trap '_clear' EXIT INT TERM HUP
[ -n "$_url" ] || { _clear; die "secret file empty — refusing" 3; }
_tail="${_url##*/}"; _db="${_tail%%\?*}"
[ "$_db" = blueprint_migration_lab ] || { _clear; die "credential does not target blueprint_migration_lab — refusing" 3; }
case "$_url" in
  *banzami_staging*|*banzami_live*|*prod*|*production*|*live*) _clear; die "forbidden target marker — refusing" 3;;
esac
( DATABASE_URL="$_url" sqlx migrate run --source "$EMBEDDED" ) >/dev/null 2>&1 \
  || { _clear; die "forward-only migration failed" 7; }
printf '  migration-identity-runner: embedded canonical migrations applied (sanitised)\n'
_clear
