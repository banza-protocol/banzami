#!/usr/bin/env bash
# =============================================================================
# Banzami migration-runner entrypoint — read-only-file secret contract ONLY.
# =============================================================================
# The database credential is read EXCLUSIVELY from a read-only mounted file. It is
# NEVER accepted through environment variables, command-line arguments, build args
# or terminal input, and is NEVER printed, echoed or logged. Runs the canonical
# forward-only migration + checksum + drift verification via the in-image sqlx/psql.
#
#   mount (read-only):  <host secret file> -> /run/secrets/rt04e_migration_url
#   invoke:             docker run --rm --network <env-data-net> \
#                         -v <host-secret-file>:/run/secrets/rt04e_migration_url:ro \
#                         banzami/migration-runner@<digest>
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

SECRET_FILE="/run/secrets/rt04e_migration_url"   # FIXED — never caller-supplied
MIGRATIONS="${RT04E_MIGRATIONS_DIR:-/work/db/migrations}"  # mounted read-only from canonical source
die() { printf 'migration-runner: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

# Reject any credential supplied via env/argv — the ONLY accepted source is the file.
[ "$#" -eq 0 ] || die "no command-line arguments permitted (credential/target must not be passed as an argument)" 2
[ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be provided via environment — read-only file only" 2
[ -z "${BANZAMI_MIGRATE_URL:-}" ] || die "a credential env marker is present — refusing" 2

# Read-only secret file must be a regular, non-symlink file.
[ -e "$SECRET_FILE" ] || die "migration secret file not mounted (read-only) — refusing" 3
[ ! -L "$SECRET_FILE" ] || die "migration secret file is a symlink — refusing" 3
[ -f "$SECRET_FILE" ] || die "migration secret file is not a regular file — refusing" 3

# Load the credential ONLY into this private process; never export beyond the
# single sqlx/psql subprocesses; never echo. Target-label validation without render.
_url="$(cat "$SECRET_FILE")"
_clear() { _url=''; unset _url 2>/dev/null || true; }
trap '_clear' EXIT INT TERM HUP
[ -n "$_url" ] || { _clear; die "migration secret file is empty — refusing" 3; }
_tail="${_url##*/}"; _db="${_tail%%\?*}"
[ "$_db" = banzami_staging ] || { _clear; die "credential does not target banzami_staging — refusing" 3; }
case "$_url" in *prod*|*production*|*banzami_live*) _clear; die "live/prod marker in target — refusing" 3;; esac

# Forward-only migration + checksum + drift verification (canonical tooling, in-image).
( cd "${RT04E_REPO_ROOT:-/work}" && DATABASE_URL="$_url" BANZAMI_DB_TARGET=banzami_staging \
    sqlx migrate run --source "$MIGRATIONS" ) >/dev/null 2>&1 || { _clear; die "forward-only migration failed" 7; }
_clear
printf '  migration-runner: forward-only migration applied (sanitised; no credential/URL emitted)\n'
