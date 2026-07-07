#!/usr/bin/env bash
# =============================================================================
# RT04E autonomous migration controller — sandbox-autonomous-migration-only
# =============================================================================
# INCREMENT 1: CONTRACT + VALIDATION LAYER ONLY. This controller is NON-DEPLOYING
# and HARD-DISABLED outside a future, separately-approved Sandbox runtime boundary.
# It performs NO migration in this increment.
#
# It replaces the manual human hidden-prompt with an explicit, single-use,
# revision/target/migration-digest-bound authorisation RECORD plus a controlled
# read-only secret file. It NEVER uses a fake TTY, PTY injection, expect, keyboard
# simulation or hidden-input automation. The existing manual RT04E path is retained
# and unchanged.
#
# Sourceable: the amc_* validation functions are unit-tested by the Blueprint
# validators without executing any migration.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

# FIXED, non-caller-supplied contract values. These are constants — the controller
# NEVER reads the target, revision, source path, migration path, secret path or
# Compose project from argv or an untrusted environment variable.
AMC_MODE="sandbox-autonomous-migration-only"
AMC_TARGET="banzami_staging"                 # EXACT fixed value (not a pattern)
AMC_COMPOSE_PROJECT="rt04e-sandbox"          # fixed
AMC_SOURCE_ROOT="/srv/banzami/src"           # fixed canonical source root
AMC_MIGRATIONS_REL="db/migrations"           # fixed, relative to source root
AMC_SECRET_FILE="/run/secrets/rt04e_migration_url"   # fixed read-only mount path
AMC_SERVICES="core-api-staging api-gateway-staging developer-api public-api-staging"  # fixed approved set
AMC_ENABLE_SENTINEL="RT04E-SANDBOX-AUTONOMOUS-RUNTIME"   # only present in a future approved runtime

amc_die() { printf 'autonomous-controller: REFUSED — %s\n' "$1" >&2; exit "${2:-1}"; }

# ── validation primitives (pure; unit-tested) ───────────────────────────────
amc_valid_rev()   { case "$1" in ""|*[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -eq 40 ]; }
amc_target_ok()   { [ "$1" = "$AMC_TARGET" ]; }
amc_service_set_ok() { [ "$1" = "$AMC_SERVICES" ]; }             # exact approved set only
amc_image_ref_immutable() {   # 0 iff tag@sha256:<64hex> and no mutable :latest
  case "$1" in *:latest|*:latest@*) return 1 ;; esac
  case "$1" in *@sha256:*) : ;; *) return 1 ;; esac
  local dg="${1##*@sha256:}"; case "$dg" in *[!0-9a-f]*|"") return 1 ;; esac; [ "${#dg}" -eq 64 ]
}
amc_provenance_ok() { [ "$1" = valid ]; }                        # runner provenance state
amc_no_concurrent_lock() { [ ! -e "$1" ]; }                     # advisory migration lock absent
amc_secret_file_contract_ok() {  # structural: regular, non-symlink, single hard link
  local f="$1"
  [ -e "$f" ] || return 1
  [ ! -L "$f" ] || return 1
  [ -f "$f" ] || return 1
  [ "$(amc_hardlinks "$f")" = 1 ] || return 1
}

# deterministic digest of the canonical migration SET (order + content bound)
amc_migration_digest() {
  local d="$1"; [ -d "$d" ] || return 1
  ( cd "$d" && ls -1 [0-9]*.sql 2>/dev/null | LC_ALL=C sort | while IFS= read -r f; do
      printf '%s\n' "$f"; shasum -a 256 "$f" 2>/dev/null || sha256sum "$f"
    done ) | { shasum -a 256 2>/dev/null || sha256sum; } | cut -d' ' -f1
}

amc_record_field() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }
amc_hardlinks()    { stat -c '%h' "$1" 2>/dev/null || stat -f '%l' "$1" 2>/dev/null; }

# single-use authorisation record: regular, non-symlink, single-link, no credential,
# issued state, revision/target/migration-digest bound, unexpired.
amc_authrecord_valid() { # $1=record $2=exp_rev $3=exp_target $4=exp_digest $5=now_epoch
  local r="$1" er="$2" et="$3" ed="$4" now="$5"
  [ -e "$r" ]  || { echo "no single-use authorisation record" >&2; return 41; }
  [ ! -L "$r" ]|| { echo "authorisation record is a symlink" >&2; return 41; }
  [ -f "$r" ]  || { echo "authorisation record is not a regular file" >&2; return 41; }
  [ "$(amc_hardlinks "$r")" = 1 ] || { echo "authorisation record has an unexpected hard-link count" >&2; return 41; }
  grep -qiE 'password|postgres(ql)?://|secret|@[^ ]*:' "$r" && { echo "authorisation record contains credential-like content" >&2; return 41; }
  [ "$(amc_record_field "$r" state)" = issued ] || { echo "authorisation record is not in single-use 'issued' state" >&2; return 42; }
  [ "$(amc_record_field "$r" source_revision)" = "$er" ] || { echo "authorisation revision binding mismatch" >&2; return 43; }
  [ "$(amc_record_field "$r" target)" = "$et" ]          || { echo "authorisation target binding mismatch" >&2; return 43; }
  [ "$(amc_record_field "$r" migration_directory_digest)" = "$ed" ] || { echo "authorisation migration-digest binding mismatch" >&2; return 43; }
  local iss; iss="$(amc_record_field "$r" issued_epoch)"
  { [ -n "$iss" ] && [ "$iss" -le "$now" ]; } || { echo "authorisation issued_epoch is missing or in the future" >&2; return 46; }
  local exp; exp="$(amc_record_field "$r" expires_epoch)"
  { [ -n "$exp" ] && [ "$now" -lt "$exp" ]; } || { echo "authorisation record expired" >&2; return 44; }
  { [ "$exp" -gt "$iss" ]; } || { echo "authorisation expiry not after issue" >&2; return 46; }
  return 0
}

# atomic single-use consumption: issued -> consumed (a second process finds nothing)
amc_consume_authrecord() { # $1=record
  local r="$1" consumed="$1.consumed"
  [ ! -e "$consumed" ] || return 45
  mv "$r" "$consumed" 2>/dev/null || return 45
  [ -e "$r" ] && return 45
  printf '%s\n' "$consumed"; return 0
}

# ── DISABLED guard (this increment performs NO migration) ────────────────────
# Only a future, separately-approved Sandbox runtime image sets the enable sentinel.
# Even when enabled, this increment's controller validates and refuses to deploy:
# the runner-image invocation is a later, separately-reviewed increment.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  [ "$#" -eq 0 ] || amc_die "no command-line arguments permitted (target/URL/paths/revision are fixed, not argv)" 2
  [ "${RT04E_AUTONOMOUS_RUNTIME:-}" = "$AMC_ENABLE_SENTINEL" ] \
    || amc_die "autonomous mode is DISABLED outside an approved Sandbox runtime boundary (contract/validation layer only)" 40
  amc_die "autonomous execution is not wired in this increment — validation layer only; use the manual RT04E path" 40
fi
