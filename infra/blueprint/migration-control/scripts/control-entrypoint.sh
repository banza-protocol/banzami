#!/usr/bin/env bash
# Banzami Increment 2E — controlled migration entrypoint (EMBEDDED in derived image).
# LOCAL/DISPOSABLE ONLY. NOT the production/Sandbox RT04E entrypoint.
#
# Reads the DB credential ONLY from a read-only mounted file. Acquires a REAL PostgreSQL
# session-level advisory lock (held across the migration via a psql coprocess) so a
# concurrent executor is refused. The credential is passed to psql via PGPASSFILE (never
# argv) and to sqlx via an in-process DATABASE_URL only. Applies ONLY embedded canonical
# migrations. Mode `fail-after-lock` proves the failure path WITHOUT mutating the database.
set -euo pipefail
set +x
umask 077
SECRET_FILE="/run/secrets/rt04e_migration_url"
EMBEDDED="/work/db/migrations"
MODE="${1:-migrate}"
LOCK_KEY="${BZMC_LOCK_KEY:-47710025}"    # fixed non-secret advisory-lock key
die() { printf 'migration-control-runner: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

[ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be provided via environment" 2
[ -e "$SECRET_FILE" ] && [ ! -L "$SECRET_FILE" ] && [ -f "$SECRET_FILE" ] || die "secret file invalid" 3
_url="$(cat "$SECRET_FILE")"
_clear() { _url=''; unset _url 2>/dev/null || true; rm -f "${PGPASSFILE:-/nonexistent}" 2>/dev/null || true; }
trap '_clear' EXIT INT TERM HUP
[ -n "$_url" ] || { _clear; die "empty secret" 3; }

# parse URL (synthetic pw has no @ or : ) — target-label validation without rendering
_rest="${_url#*://}"; _creds="${_rest%@*}"; _hostpart="${_rest#*@}"
_user="${_creds%%:*}"; _pw="${_creds#*:}"
_hostport="${_hostpart%%/*}"; _host="${_hostport%%:*}"; _port="${_hostport#*:}"; [ "$_port" = "$_hostport" ] && _port=5432
_db="${_hostpart#*/}"; _db="${_db%%\?*}"
[ "$_db" = blueprint_migration_lab ] || { _clear; die "credential does not target blueprint_migration_lab" 3; }
case "$_url" in *banzami_staging*|*banzami_live*|*prod*|*production*|*live*) _clear; die "forbidden target marker" 3;; esac

# credential to psql via PGPASSFILE (NEVER argv/env value)
PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
printf '%s:%s:*:%s:%s\n' "$_host" "$_port" "$_user" "$_pw" > "$PGPASSFILE"

# acquire a HELD session-level advisory lock via a FIFO-fed background psql session
# (portable equivalent of a coprocess; refuse if the lock is already held elsewhere).
LOCK_FIFO="$(mktemp -u)"; mkfifo "$LOCK_FIFO"
LOCK_OUT="$(mktemp)"
_lockclear() { exec 8>&- 2>/dev/null || true; rm -f "$LOCK_FIFO" "$LOCK_OUT" 2>/dev/null || true; }
psql -h "$_host" -p "$_port" -U "$_user" -d "$_db" -Atq < "$LOCK_FIFO" > "$LOCK_OUT" 2>/dev/null &
LOCK_PID=$!
exec 8>"$LOCK_FIFO"            # keep the write end open so the psql session (and lock) persists
printf 'SELECT pg_try_advisory_lock(%s);\n' "$LOCK_KEY" >&8
_got=""
for _i in $(seq 1 50); do [ -s "$LOCK_OUT" ] && { _got="$(head -1 "$LOCK_OUT")"; break; }; sleep 0.1; done
if [ "$_got" != "t" ]; then
  printf '  migration-control-runner: MIGRATION_LOCK_HELD — refusing (no migration attempted)\n'
  _lockclear; wait "$LOCK_PID" 2>/dev/null || true; _clear; exit 9
fi

_rc=0
case "$MODE" in
  migrate)
    ( DATABASE_URL="$_url" sqlx migrate run --source "$EMBEDDED" ) >/dev/null 2>&1 || _rc=7
    ;;
  fail-after-lock)
    # controlled failure during a non-mutating stage (no SQL executed) — proves the
    # receipt-consumption rule without corrupting canonical migration source.
    _rc=8
    ;;
  *) _rc=2 ;;
esac

# release the lock (completion or failure) by ending the held session
printf 'SELECT pg_advisory_unlock(%s);\n' "$LOCK_KEY" >&8 2>/dev/null || true
_lockclear; wait "$LOCK_PID" 2>/dev/null || true
_clear
[ "$_rc" -eq 0 ] && printf '  migration-control-runner: embedded canonical migrations applied under advisory lock (sanitised)\n'
exit "$_rc"
