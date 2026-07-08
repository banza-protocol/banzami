#!/usr/bin/env bash
# Banzami Environment Blueprint — controlled OPERATIONAL migration entrypoint (embedded).
#
# The ONLY controlled path permitted to target banzami_staging — and only inside a generated
# internal Sandbox project (host = postgres on the data network, no host port). It reads the
# credential ONLY from a read-only mounted file, holds a REAL advisory lock across the
# migration (via a FIFO-fed session), and applies ONLY the embedded canonical migrations.
# It NEVER accepts live/prod/production/banzami_live or an external host/port, and NEVER
# routes through the legacy RT04E path. The disposable-lab entrypoints keep their
# blueprint_migration_lab guard unchanged; this operational entrypoint is separate.
set -euo pipefail
set +x
umask 077
SECRET_FILE="/run/secrets/rt04e_migration_url"
EMBEDDED="/work/db/migrations"
MODE="${1:-migrate}"
LOCK_KEY="${BZMC_LOCK_KEY:-47710026}"
die() { printf 'sandbox-migration-runner: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

[ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be provided via environment" 2
[ -e "$SECRET_FILE" ] && [ ! -L "$SECRET_FILE" ] && [ -f "$SECRET_FILE" ] || die "secret file invalid" 3
_url="$(cat "$SECRET_FILE")"
_clear() { _url=''; unset _url 2>/dev/null || true; rm -f "${PGPASSFILE:-/nonexistent}" 2>/dev/null || true; }
trap '_clear' EXIT INT TERM HUP
[ -n "$_url" ] || { _clear; die "empty secret" 3; }

_rest="${_url#*://}"; _creds="${_rest%@*}"; _hostpart="${_rest#*@}"
_user="${_creds%%:*}"; _pw="${_creds#*:}"
_hostport="${_hostpart%%/*}"; _host="${_hostport%%:*}"; _port="${_hostport#*:}"; [ "$_port" = "$_hostport" ] && _port=5432
_db="${_hostpart#*/}"; _db="${_db%%\?*}"

# operational target contract: banzami_staging ONLY, on the internal Sandbox host, no host port
[ "$_db" = banzami_staging ] || { _clear; die "operational target must be banzami_staging" 3; }
[ "$_host" = postgres ] || { _clear; die "operational host must be the internal Sandbox database service" 3; }
case "$_url" in *banzami_live*|*production*|*prod*|*live*) _clear; die "forbidden environment marker" 3;; esac

PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
printf '%s:%s:*:%s:%s\n' "$_host" "$_port" "$_user" "$_pw" > "$PGPASSFILE"

# held advisory lock via FIFO-fed session (portable; refuse if already held)
LOCK_FIFO="$(mktemp -u)"; mkfifo "$LOCK_FIFO"; LOCK_OUT="$(mktemp)"
_lockclear() { exec 8>&- 2>/dev/null || true; rm -f "$LOCK_FIFO" "$LOCK_OUT" 2>/dev/null || true; }
psql -h "$_host" -p "$_port" -U "$_user" -d "$_db" -Atq < "$LOCK_FIFO" > "$LOCK_OUT" 2>/dev/null &
LOCK_PID=$!
exec 8>"$LOCK_FIFO"
printf 'SELECT pg_try_advisory_lock(%s);\n' "$LOCK_KEY" >&8
_got=""; for _i in $(seq 1 50); do [ -s "$LOCK_OUT" ] && { _got="$(head -1 "$LOCK_OUT")"; break; }; sleep 0.1; done
if [ "$_got" != "t" ]; then
  printf '  sandbox-migration-runner: MIGRATION_LOCK_HELD — refusing (no migration attempted)\n'
  _lockclear; wait "$LOCK_PID" 2>/dev/null || true; _clear; exit 9
fi

_rc=0
case "$MODE" in
  migrate) ( DATABASE_URL="$_url" sqlx migrate run --source "$EMBEDDED" ) >/dev/null 2>&1 || _rc=7 ;;
  fail-after-lock) _rc=8 ;;
  *) _rc=2 ;;
esac
printf 'SELECT pg_advisory_unlock(%s);\n' "$LOCK_KEY" >&8 2>/dev/null || true
_lockclear; wait "$LOCK_PID" 2>/dev/null || true
_clear
[ "$_rc" -eq 0 ] && printf '  sandbox-migration-runner: banzami_staging canonical migrations applied under advisory lock (sanitised)\n'
exit "$_rc"
